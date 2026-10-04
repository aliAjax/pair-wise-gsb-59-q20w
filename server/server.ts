import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import {
  createAudit,
  createClarificationId,
  createConfirmationId,
  createConflictId,
  createOpinionId,
  reviewDataStore,
} from "./data";
import { typeDefs } from "./schema";
import type {
  AssessmentInput,
  ClarificationInput,
  ClarificationResponseInput,
  Clause,
  ConfirmScopeInput,
  DashboardStats,
  FinalizeVersionInput,
  ProofMaterial,
  ReviewDatabase,
  ReviewRole,
  ScopeConfirmation,
  SealedProof,
  SupplierResponse,
  UpdateProofMaterialInput,
} from "./types";

/**
 * 覆盖某响应的生效核验单：同一材料上，核验单的供应商与响应一致、
 * 且勾选条款包含响应所属条款（一张单可覆盖该供应商的多个条款响应）。
 */
const activeConfirmationForResponse = (
  database: ReviewDatabase,
  response: SupplierResponse,
): ScopeConfirmation | undefined => {
  const material = materialForResponse(database, response);
  if (!material) {
    return undefined;
  }
  return database.scopeConfirmations.find(
    (confirmation) =>
      confirmation.status === "active" &&
      confirmation.materialId === material.id &&
      confirmation.materialRevision === material.revision &&
      confirmation.supplierId === response.supplierId &&
      confirmation.clauseIds.includes(response.clauseId),
  );
};

const materialForResponse = (
  database: ReviewDatabase,
  response: SupplierResponse,
): ProofMaterial | undefined =>
  database.materials.find(
    (material) => material.fingerprint === response.proofFingerprint,
  );

/** 同一指纹首次出现时自动汇成材料记录（正常情况下种子数据已覆盖）。 */
const ensureMaterials = (database: ReviewDatabase): void => {
  database.responses.forEach((response) => {
    if (
      response.proofFingerprint &&
      !materialForResponse(database, response)
    ) {
      const now = new Date().toISOString();
      database.materials.push({
        id: `MAT-${String(database.materials.length + 1).padStart(3, "0")}`,
        fingerprint: response.proofFingerprint,
        attachmentName: response.attachmentName,
        revision: 1,
        firstSeenAt: response.submittedAt || now,
        updatedAt: now,
        updatedBy: response.submittedBy,
      });
    }
  });
};

const isScopeConfirmed = (
  database: ReviewDatabase,
  response: SupplierResponse,
): boolean => Boolean(activeConfirmationForResponse(database, response));

const hasActiveOpinion = (response: SupplierResponse): boolean =>
  response.reviews.some((review) => !review.superseded);

const isPendingReReview = (response: SupplierResponse): boolean =>
  response.reviews.some(
    (review) => review.superseded && !review.sealedByVersion,
  ) && !hasActiveOpinion(response);

const getDashboard = (database: ReviewDatabase): DashboardStats => {
  const opinionsByResponse = database.responses.map((response) => {
    const decisions = new Set(
      response.reviews
        .filter(
          (review) =>
            !review.superseded && review.decision !== "clarification",
        )
        .map((review) => review.decision),
    );
    return decisions.size > 1;
  });
  const proofCounts = database.responses.reduce<Record<string, number>>(
    (counts, response) => {
      if (response.proofFingerprint) {
        counts[response.proofFingerprint] =
          (counts[response.proofFingerprint] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  const activeVersion =
    database.versions.find((version) => version.status === "draft") ??
    database.versions[0];

  return {
    totalClauses: database.clauses.length,
    mandatoryCount: database.clauses.filter(
      (clause) => clause.type === "mandatory",
    ).length,
    pendingReviews: database.responses.filter(
      (response) =>
        response.reviews.filter((review) => !review.superseded).length < 2,
    ).length,
    differences: opinionsByResponse.filter(Boolean).length,
    overdueClarifications: database.responses.reduce(
      (count, response) =>
        count +
        response.clarifications.filter(
          (clarification) => clarification.status === "overdue",
        ).length,
      0,
    ),
    reusedProofs: Object.values(proofCounts).filter((count) => count > 1)
      .length,
    activeVersion: activeVersion
      ? `${activeVersion.version} ${activeVersion.label}`
      : "未建立版本",
    materialCount: database.materials.length,
    pendingScopeConfirmations: database.responses.filter(
      (response) => !isScopeConfirmed(database, response),
    ).length,
    pendingReReviews: database.responses.filter(isPendingReReview).length,
    openScopeConflicts: database.scopeConflicts.filter(
      (conflict) => conflict.status === "open",
    ).length,
  };
};

const buildMaterialCoverages = (database: ReviewDatabase) =>
  database.materials.map((material) => {
    const usages = database.responses
      .filter((response) => response.proofFingerprint === material.fingerprint)
      .map((response) => {
        const clause = database.clauses.find(
          (item) => item.id === response.clauseId,
        );
        return {
          responseId: response.id,
          clauseId: response.clauseId,
          supplierId: response.supplierId,
          supplierName: response.supplierName,
          clauseCode: clause?.code ?? response.clauseId,
          clauseTitle: clause?.title ?? "",
          currentFingerprint: response.proofFingerprint,
          currentAttachmentName: response.attachmentName,
        };
      });
    const confirmations = database.scopeConfirmations.filter(
      (confirmation) => confirmation.materialId === material.id,
    );
    const activeConfirmations = confirmations.filter(
      (confirmation) => confirmation.status === "active",
    );
    const invalidatedConfirmations = confirmations.filter(
      (confirmation) => confirmation.status === "invalidated",
    );
    const openConflicts = database.scopeConflicts.filter(
      (conflict) =>
        conflict.materialId === material.id && conflict.status === "open",
    );
    const coveredSupplierIds = Array.from(
      new Set(activeConfirmations.map((item) => item.supplierId)),
    );
    const coveredClauseIds = Array.from(
      new Set(activeConfirmations.flatMap((item) => item.clauseIds)),
    );
    const coveredSupplierNames = coveredSupplierIds.map(
      (supplierId) =>
        database.suppliers.find((supplier) => supplier.id === supplierId)
          ?.name ?? supplierId,
    );
    const coveredClauseLabels = coveredClauseIds.map((clauseId) => {
      const clause = database.clauses.find((item) => item.id === clauseId);
      return clause ? `${clause.code} ${clause.title}` : clauseId;
    });
    const pendingResponseIds = usages
      .filter((usage) => {
        const response = database.responses.find(
          (item) => item.id === usage.responseId,
        );
        return response ? !isScopeConfirmed(database, response) : true;
      })
      .map((usage) => usage.responseId);
    const pendingReReviewCount = usages.filter((usage) => {
      const response = database.responses.find(
        (item) => item.id === usage.responseId,
      );
      return response && isPendingReReview(response);
    }).length;
    return {
      material,
      usages,
      activeConfirmations,
      invalidatedConfirmations,
      openConflicts,
      coveredSupplierIds,
      coveredClauseIds,
      coveredSupplierNames,
      coveredClauseLabels,
      pendingResponseIds,
      pendingReReviewCount,
    };
  });

const buildSealedProofs = (database: ReviewDatabase): SealedProof[] =>
  database.materials.map((material) => ({
    fingerprint: material.fingerprint,
    attachmentName: material.attachmentName,
    revision: material.revision,
    responseIds: database.responses
      .filter((response) => response.proofFingerprint === material.fingerprint)
      .map((response) => response.id),
  }));

const requireRole = (role: ReviewRole, allowed: ReviewRole[]): void => {
  if (!allowed.includes(role)) {
    throw new Error("当前角色无权执行此操作。");
  }
};

const resolvers = {
  Query: {
    workspace: () => {
      const database = reviewDataStore.snapshot();
      ensureMaterials(database);
      return {
        ...database,
        dashboard: getDashboard(database),
        materialCoverages: buildMaterialCoverages(database),
      };
    },
    dashboard: () => getDashboard(reviewDataStore.snapshot()),
  },
  Clause: {
    responses: (clause: Clause, _args: unknown, context: { database: ReviewDatabase }) =>
      context.database.responses.filter(
        (response) => response.clauseId === clause.id,
      ),
  },
  SupplierResponse: {
    scopeConfirmed: (response: SupplierResponse, _args: unknown, context: { database: ReviewDatabase }) =>
      isScopeConfirmed(context.database, response),
    scopeMatches: (response: SupplierResponse, _args: unknown, context: { database: ReviewDatabase }) =>
      Boolean(activeConfirmationForResponse(context.database, response)),
    pendingReReview: (response: SupplierResponse) =>
      isPendingReReview(response),
  },
  ProofMaterial: {
    usages: (material: ProofMaterial, _args: unknown, context: { database: ReviewDatabase }) =>
      context.database.responses
        .filter((response) => response.proofFingerprint === material.fingerprint)
        .map((response) => {
          const clause = context.database.clauses.find(
            (item) => item.id === response.clauseId,
          );
          return {
            responseId: response.id,
            clauseId: response.clauseId,
            supplierId: response.supplierId,
            supplierName: response.supplierName,
            clauseCode: clause?.code ?? response.clauseId,
            clauseTitle: clause?.title ?? "",
            currentFingerprint: response.proofFingerprint,
            currentAttachmentName: response.attachmentName,
          };
        }),
  },
  ScopeConfirmation: {
    coversResponse: (confirmation: ScopeConfirmation, args: { responseId: string }, context: { database: ReviewDatabase }) => {
      const response = context.database.responses.find(
        (item) => item.id === args.responseId,
      );
      return Boolean(
        response &&
          confirmation.supplierId === response.supplierId &&
          confirmation.clauseIds.includes(response.clauseId),
      );
    },
    coversClause: (confirmation: ScopeConfirmation, args: { clauseId: string }) =>
      confirmation.clauseIds.includes(args.clauseId),
  },
  Mutation: {
    submitAssessment: (
      _parent: unknown,
      { input }: { input: AssessmentInput },
    ) => {
      requireRole(input.role, ["reviewer_a", "reviewer_b", "chair"]);
      if (input.comment.trim().length < 6) {
        throw new Error("评审意见至少需要 6 个字符。");
      }
      return reviewDataStore.mutate((database) => {
        const response = database.responses.find(
          (item) => item.id === input.responseId,
        );
        if (!response) {
          throw new Error("供应商响应不存在。");
        }
        if (!isScopeConfirmed(database, response)) {
          throw new Error(
            "该响应尚未确认证明材料适用范围，核验通过前不得进入评审。",
          );
        }
        const clause = database.clauses.find(
          (item) => item.id === response.clauseId,
        );
        if (!clause) {
          throw new Error("对应技术条款不存在。");
        }
        if (input.score < 0 || input.score > clause.weight) {
          throw new Error(`评分必须在 0 至 ${clause.weight} 之间。`);
        }
        if (
          clause.type === "scoring" &&
          input.decision === "compliant" &&
          input.score === 0
        ) {
          throw new Error("评分项判定为符合时必须填写评分。");
        }
        const opinion = {
          id: createOpinionId(),
          responseId: response.id,
          reviewer: input.reviewer.trim(),
          role: input.role,
          decision: input.decision,
          score: input.score,
          comment: input.comment.trim(),
          createdAt: new Date().toISOString(),
          superseded: false,
        };
        response.reviews.push(opinion);
        response.status = input.decision;
        response.reviewRound = Math.max(response.reviewRound, 1);
        createAudit(
          database,
          opinion.reviewer,
          "提交独立意见",
          response.id,
          `${clause.code} ${clause.title} 判定为 ${input.decision}，评分 ${input.score}。`,
        );
        return opinion;
      });
    },
    requestClarification: (
      _parent: unknown,
      { input }: { input: ClarificationInput },
    ) =>
      reviewDataStore.mutate((database) => {
        const response = database.responses.find(
          (item) => item.id === input.responseId,
        );
        if (!response) {
          throw new Error("供应商响应不存在。");
        }
        if (input.requestText.trim().length < 6) {
          throw new Error("澄清要求至少需要 6 个字符。");
        }
        const requestedAt = new Date();
        const dueAt = new Date(input.dueAt);
        if (Number.isNaN(dueAt.getTime()) || dueAt <= requestedAt) {
          throw new Error("澄清截止时间必须晚于当前时间。");
        }
        const maximumDueAt = new Date(requestedAt);
        maximumDueAt.setDate(maximumDueAt.getDate() + 7);
        if (dueAt > maximumDueAt) {
          throw new Error("澄清期限不得超过 7 个自然日。");
        }
        const round =
          Math.max(
            0,
            ...response.clarifications.map((item) => item.round),
          ) + 1;
        const clarification = {
          id: createClarificationId(),
          responseId: response.id,
          clauseId: response.clauseId,
          round,
          requestText: input.requestText.trim(),
          requestedAt: requestedAt.toISOString(),
          dueAt: dueAt.toISOString(),
          status: "open" as const,
        };
        response.clarifications.push(clarification);
        response.status = "clarification";
        createAudit(
          database,
          input.actor,
          "发起澄清",
          clarification.id,
          `${response.supplierName} ${response.clauseId} 第 ${round} 轮澄清已发起。`,
        );
        return clarification;
      }),
    respondClarification: (
      _parent: unknown,
      { input }: { input: ClarificationResponseInput },
    ) =>
      reviewDataStore.mutate((database) => {
        const clarification = database.responses
          .flatMap((response) => response.clarifications)
          .find((item) => item.id === input.clarificationId);
        if (!clarification) {
          throw new Error("澄清记录不存在。");
        }
        if (input.responseText.trim().length < 6) {
          throw new Error("澄清回复至少需要 6 个字符。");
        }
        clarification.supplierResponse = input.responseText.trim();
        clarification.respondedAt = new Date().toISOString();
        clarification.status = "responded";
        const response = database.responses.find(
          (item) => item.id === clarification.responseId,
        );
        if (response) {
          response.status = "pending";
        }
        createAudit(
          database,
          input.actor,
          "回复澄清",
          clarification.id,
          `第 ${clarification.round} 轮澄清已回复，等待评审员复核。`,
        );
        return clarification;
      }),
    confirmScope: (
      _parent: unknown,
      { input }: { input: ConfirmScopeInput },
    ) => {
      requireRole(input.role, ["procurement", "chair"]);
      if (!input.ticketId.trim()) {
        throw new Error("核验单编号缺失，无法保证重试幂等。");
      }
      if (input.simulateFailure) {
        throw new Error("模拟保存失败：请沿用原核验单编号重试，不应产生重复记录。");
      }
      return reviewDataStore.mutate((database) => {
        ensureMaterials(database);
        const response = database.responses.find(
          (item) => item.id === input.responseId,
        );
        if (!response) {
          throw new Error("供应商响应不存在。");
        }
        const clauseIds = Array.from(new Set(input.clauseIds));
        if (clauseIds.length === 0) {
          throw new Error("请至少勾选一个被材料覆盖的技术条款。");
        }
        const unknownClause = clauseIds.find(
          (clauseId) =>
            !database.clauses.some((clause) => clause.id === clauseId),
        );
        if (unknownClause) {
          throw new Error(`技术条款 ${unknownClause} 不存在。`);
        }
        if (input.note.trim().length < 4) {
          throw new Error("适用范围说明至少需要 4 个字符。");
        }

        const material = materialForResponse(database, response);
        if (!material) {
          throw new Error("该响应尚无指纹，无法建立材料记录。");
        }

        // 保存失败后沿用原核验单重试：同 ticketId 永远只对应一条记录。
        const existingTicket = database.scopeConfirmations.find(
          (item) => item.ticketId === input.ticketId,
        );
        if (existingTicket && existingTicket.status === "active") {
          return {
            confirmation: existingTicket,
            conflict: null,
            materialRevision: material.revision,
            materialChanged: false,
            reusedTicket: true,
          };
        }

        // 冲突处理后沿用同一 ticketId 重试，或失效核验单重新提交：复用原记录。
        const resolvedTicketConflict = database.scopeConflicts.find(
          (item) =>
            item.ticketId === input.ticketId && item.status === "resolved",
        );
        const priorConflict = database.scopeConflicts.find(
          (item) => item.ticketId === input.ticketId,
        );
        const blockingConflict = database.scopeConflicts.find(
          (item) =>
            item.materialId === material.id &&
            item.supplierId === response.supplierId &&
            item.status === "open",
        );
        const otherSupplierConfirmation = database.scopeConfirmations.find(
          (item) =>
            item.materialId === material.id &&
            item.status === "active" &&
            item.supplierId !== response.supplierId,
        );
        if (
          otherSupplierConfirmation &&
          !resolvedTicketConflict &&
          !existingTicket
        ) {
          const conflict =
            priorConflict ??
            (() => {
              const created = {
                id: createConflictId(),
                materialId: material.id,
                supplierId: response.supplierId,
                responseId: response.id,
                ticketId: input.ticketId,
                conflictingBy: otherSupplierConfirmation.confirmedBy,
                conflictingAt: otherSupplierConfirmation.confirmedAt,
                conflictingSupplierId: otherSupplierConfirmation.supplierId,
                conflictingClauseIds: [
                  ...otherSupplierConfirmation.clauseIds,
                ],
                attemptedClauseIds: clauseIds,
                attemptedNote: input.note.trim(),
                status: "open" as const,
              };
              database.scopeConflicts.unshift(created);
              createAudit(
                database,
                input.actor,
                "适用范围冲突",
                created.id,
                `${response.supplierName} 后到：材料已由 ${otherSupplierConfirmation.confirmedBy} 确认覆盖 ${otherSupplierConfirmation.clauseIds.join("、")}，填写内容已保留。`,
              );
              return created;
            })();
          return {
            confirmation: null,
            conflict: blockingConflict ?? conflict,
            materialRevision: material.revision,
            materialChanged: true,
            reusedTicket: false,
          };
        }

        const now = new Date().toISOString();
        let confirmation: ScopeConfirmation;
        let reusedTicket = false;
        // 对已核验响应“重新核验”：直接更新原生效单，不为同一供应商+条款多建记录。
        const existingActive =
          existingTicket ??
          database.scopeConfirmations.find(
            (item) =>
              item.status === "active" &&
              item.materialId === material.id &&
              item.supplierId === response.supplierId &&
              item.clauseIds.includes(response.clauseId),
          );
        if (existingActive) {
          // 原核验单处于失效状态或重复核验：在原记录上更新，不多出记录。
          existingActive.materialRevision = material.revision;
          existingActive.responseId = response.id;
          existingActive.supplierId = response.supplierId;
          existingActive.clauseIds = clauseIds;
          existingActive.note = input.note.trim();
          existingActive.confirmedBy = input.actor.trim();
          existingActive.confirmedAt = now;
          existingActive.status = "active";
          existingActive.invalidatedAt = undefined;
          existingActive.invalidatedReason = undefined;
          confirmation = existingActive;
          reusedTicket = true;
        } else {
          confirmation = {
            id: createConfirmationId(),
            ticketId: input.ticketId,
            materialId: material.id,
            materialRevision: material.revision,
            responseId: response.id,
            supplierId: response.supplierId,
            clauseIds,
            note: input.note.trim(),
            confirmedBy: input.actor.trim(),
            confirmedAt: now,
            status: "active",
          };
          database.scopeConfirmations.unshift(confirmation);
        }
        createAudit(
          database,
          input.actor.trim(),
          "确认适用范围",
          confirmation.id,
          `${response.supplierName} ${response.clauseId} 核验通过，材料 ${material.fingerprint} 覆盖供应商 ${response.supplierName}、条款 ${clauseIds.join("、")}。`,
        );
        return {
          confirmation,
          conflict: null,
          materialRevision: material.revision,
          materialChanged: false,
          reusedTicket,
        };
      });
    },
    updateProofMaterial: (
      _parent: unknown,
      { input }: { input: UpdateProofMaterialInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["procurement", "chair"]);
        ensureMaterials(database);
        const material = database.materials.find(
          (item) => item.id === input.materialId,
        );
        if (!material) {
          throw new Error("证明材料记录不存在。");
        }
        if (input.attachmentName.trim().length < 4) {
          throw new Error("附件名称至少需要 4 个字符。");
        }
        const now = new Date().toISOString();
        const affectedResponses = database.responses.filter(
          (response) => response.proofFingerprint === material.fingerprint,
        );
        const newFingerprint = input.fingerprint?.trim();
        let target = material;

        if (newFingerprint && newFingerprint !== material.fingerprint) {
          if (
            database.materials.some(
              (item) => item.fingerprint === newFingerprint,
            )
          ) {
            throw new Error("新指纹已对应其他材料记录，请先在核验台合并核对。");
          }
          // 指纹变化视为另一份材料：新建材料记录，原记录保留在盖章版本中。
          target = {
            id: `MAT-${String(database.materials.length + 1).padStart(3, "0")}`,
            fingerprint: newFingerprint,
            attachmentName: input.attachmentName.trim(),
            revision: 1,
            firstSeenAt: now,
            updatedAt: now,
            updatedBy: input.actor.trim(),
          };
          database.materials.push(target);
        } else {
          material.revision += 1;
          material.attachmentName = input.attachmentName.trim();
          material.updatedAt = now;
          material.updatedBy = input.actor.trim();
        }

        affectedResponses.forEach((response) => {
          response.attachmentName = target.attachmentName;
          response.proofFingerprint = target.fingerprint;
          response.status = "pending";
          response.reviewRound += 1;
          // 未定稿意见随核验单一并失效；盖章版本中的意见继续保留。
          response.reviews.forEach((review) => {
            if (!review.superseded && !review.sealedByVersion) {
              review.superseded = true;
              review.supersedeReason =
                newFingerprint && newFingerprint !== material.fingerprint
                  ? "证明指纹更新后未定稿意见失效，待按新材料重评。"
                  : "证明附件更新后未定稿意见失效，待按新材料重评。";
            }
          });
        });

        // 未盖章核验单全部失效；已盖章版本快照不受影响。
        database.scopeConfirmations
          .filter(
            (confirmation) =>
              confirmation.materialId === material.id &&
              confirmation.status === "active",
          )
          .forEach((confirmation) => {
            confirmation.status = "invalidated";
            confirmation.invalidatedAt = now;
            confirmation.invalidatedReason =
              target.id === material.id
                ? `证明材料附件更新到 revision ${target.revision}，核验单失效。`
                : "证明材料指纹更新，核验单失效。";
          });

        createAudit(
          database,
          input.actor.trim(),
          "更新证明材料",
          target.id,
          newFingerprint && newFingerprint !== material.fingerprint
            ? `指纹由 ${material.fingerprint} 更新为 ${newFingerprint}：原核验单失效、未定稿意见转待重评，盖章版本保留原材料。`
            : `附件更新到 revision ${target.revision}：未盖章核验单失效、未定稿意见转待重评，盖章版本保留原材料。`,
        );
        return target;
      }),
    resolveScopeConflict: (
      _parent: unknown,
      args: { conflictId: string; actor: string },
    ) =>
      reviewDataStore.mutate((database) => {
        const conflict = database.scopeConflicts.find(
          (item) => item.id === args.conflictId,
        );
        if (!conflict) {
          throw new Error("冲突记录不存在。");
        }
        if (conflict.status === "resolved") {
          return conflict;
        }
        conflict.status = "resolved";
        conflict.resolvedAt = new Date().toISOString();
        conflict.resolvedBy = args.actor;
        createAudit(
          database,
          args.actor,
          "处理适用范围冲突",
          conflict.id,
          `冲突来源 ${conflict.conflictingBy} 已核对，后到一方可沿用原 ticketId 重新提交。`,
        );
        return conflict;
      }),
    finalizeVersion: (
      _parent: unknown,
      { input }: { input: FinalizeVersionInput },
    ) =>
      reviewDataStore.mutate((database) => {
        requireRole(input.role, ["chair"]);
        if (input.label.trim().length < 4) {
          throw new Error("版本名称至少需要 4 个字符。");
        }
        const blockingClarifications = database.responses
          .flatMap((response) => response.clarifications)
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          );
        if (blockingClarifications.length > 0) {
          throw new Error(
            `仍有 ${blockingClarifications.length} 项未完成澄清，不能定稿。`,
          );
        }
        const unscopedResponses = database.responses.filter(
          (response) => !isScopeConfirmed(database, response),
        );
        if (unscopedResponses.length > 0) {
          throw new Error(
            `仍有 ${unscopedResponses.length} 项响应未确认证明材料适用范围，不能定稿。`,
          );
        }
        const reReviewResponses = database.responses.filter(
          isPendingReReview,
        );
        if (reReviewResponses.length > 0) {
          throw new Error(
            `证明材料更新后仍有 ${reReviewResponses.length} 项待重评，不能定稿。`,
          );
        }
        const openConflicts = database.scopeConflicts.filter(
          (conflict) => conflict.status === "open",
        );
        if (openConflicts.length > 0) {
          throw new Error(
            `仍有 ${openConflicts.length} 起适用范围冲突未处理，不能定稿。`,
          );
        }
        const maxVersion =
          database.versions.reduce((maximum, version) => {
            const numeric = Number(version.version.replace(/\D/g, ""));
            return Number.isFinite(numeric)
              ? Math.max(maximum, numeric)
              : maximum;
          }, 0) + 1;
        database.versions.forEach((version) => {
          version.status = "finalized";
        });
        const version = {
          id: `VER-${Date.now()}`,
          version: `V${maxVersion}`,
          label: input.label.trim(),
          status: "finalized" as const,
          createdAt: new Date().toISOString(),
          createdBy: input.actor,
          signedBy: [input.actor],
          clauseCount: database.clauses.length,
          responseCount: database.responses.length,
          contentHash: Math.random().toString(16).slice(2, 10),
          sealedProofs: buildSealedProofs(database),
        };
        // 盖章版本继续保留原材料与当时的有效意见。
        database.responses.forEach((response) => {
          response.reviews.forEach((review) => {
            if (!review.superseded) {
              review.sealedByVersion = version.id;
            }
          });
        });
        database.versions.unshift(version);
        createAudit(
          database,
          input.actor,
          "汇总签字定稿",
          version.id,
          `${version.version} ${version.label} 已锁定，签署人 ${input.actor}，证明材料快照 ${version.sealedProofs.length} 条。`,
        );
        return version;
      }),
    resetReviewData: () => {
      reviewDataStore.reset();
      return true;
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

async function startServer(): Promise<void> {
  const { url } = await startStandaloneServer(server, {
    listen: { port: 18462, host: "0.0.0.0" },
    context: async () => ({
      database: reviewDataStore.snapshot(),
    }),
  });
  console.log(`GraphQL mock server ready at ${url}`);
}

void startServer();
