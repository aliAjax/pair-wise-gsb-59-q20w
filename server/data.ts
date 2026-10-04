import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AuditLog,
  Clarification,
  Clause,
  ComplianceStatus,
  ProofMaterial,
  ReviewDatabase,
  ReviewRole,
  ReviewerOpinion,
  ScopeConfirmation,
  ScopeConflict,
  SealedProof,
  SupplierResponse,
} from "./types";

const clauses: Clause[] = [
  {
    id: "C001",
    code: "A.1",
    title: "实施组织与项目计划",
    category: "实施能力",
    requirement:
      "投标人应明确项目组织、职责界面、实施方法、进度控制和风险应对机制。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 1,
  },
  {
    id: "C002",
    code: "A.1.1",
    title: "项目经理及关键人员",
    category: "实施能力",
    requirement:
      "项目经理应具备五年以上同类项目经验，关键人员配置应覆盖架构、开发、测试与安全。",
    type: "mandatory",
    weight: 0,
    parentId: "C001",
    evidenceRequired: true,
    order: 2,
  },
  {
    id: "C003",
    code: "A.1.2",
    title: "实施进度与里程碑",
    category: "实施能力",
    requirement:
      "提供可核验的里程碑、交付物、验收条件和资源投入计划。",
    type: "scoring",
    weight: 15,
    parentId: "C001",
    evidenceRequired: false,
    order: 3,
  },
  {
    id: "C004",
    code: "B.1",
    title: "技术架构与互操作性",
    category: "技术方案",
    requirement:
      "系统架构应支持模块化部署、横向扩展，并与采购人现有平台实现稳定互操作。",
    type: "scoring",
    weight: 25,
    evidenceRequired: true,
    order: 4,
  },
  {
    id: "C005",
    code: "B.1.1",
    title: "接口开放与标准协议",
    category: "技术方案",
    requirement:
      "对外接口应遵循 HTTPS、OAuth 2.0 和 OpenAPI 3.x，提供版本兼容与错误码说明。",
    type: "mandatory",
    weight: 0,
    parentId: "C004",
    evidenceRequired: true,
    order: 5,
  },
  {
    id: "C006",
    code: "B.1.2",
    title: "国产化兼容性",
    category: "技术方案",
    requirement:
      "提供操作系统、数据库、中间件及浏览器兼容性矩阵，并说明适配边界。",
    type: "scoring",
    weight: 15,
    parentId: "C004",
    evidenceRequired: true,
    order: 6,
  },
  {
    id: "C007",
    code: "C.1",
    title: "安全保障",
    category: "安全与合规",
    requirement:
      "技术方案应覆盖身份鉴别、访问控制、审计、数据保护和安全运维。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 7,
  },
  {
    id: "C008",
    code: "C.1.1",
    title: "等级保护三级证明材料",
    category: "安全与合规",
    requirement:
      "提供有效的网络安全等级保护三级备案证明或第三方测评结论。",
    type: "evidence",
    weight: 0,
    parentId: "C007",
    evidenceRequired: true,
    order: 8,
  },
  {
    id: "C009",
    code: "C.1.2",
    title: "漏洞响应机制",
    category: "安全与合规",
    requirement:
      "说明漏洞发现、分级、修复、复测和重大事件通报时限。",
    type: "scoring",
    weight: 15,
    parentId: "C007",
    evidenceRequired: false,
    order: 9,
  },
  {
    id: "C010",
    code: "D.1",
    title: "服务与培训",
    category: "服务保障",
    requirement:
      "提供驻场、巡检、培训、知识转移和故障升级的服务方案及量化响应指标。",
    type: "scoring",
    weight: 20,
    evidenceRequired: false,
    order: 10,
  },
  {
    id: "C011",
    code: "D.2",
    title: "验收指标",
    category: "服务保障",
    requirement:
      "验收指标应可测量、可复现，并与采购需求中的服务水平保持一致。",
    type: "mandatory",
    weight: 0,
    evidenceRequired: true,
    order: 11,
  },
];

const suppliers = [
  { id: "SUP-A", name: "华云数科" },
  { id: "SUP-B", name: "北辰信息" },
  { id: "SUP-C", name: "南岭科技" },
];

const responseOverrides: Record<
  string,
  Partial<
    Pick<
      SupplierResponse,
      "status" | "claimedScore" | "attachmentName" | "proofFingerprint"
    >
  >
> = {
  "C001-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "项目组织方案.pdf",
    proofFingerprint: "PROOF-PLAN-A",
  },
  "C001-SUP-B": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "实施组织与计划.pdf",
    proofFingerprint: "PROOF-PLAN-B",
  },
  "C001-SUP-C": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "项目管理说明.pdf",
    proofFingerprint: "PROOF-PLAN-C",
  },
  "C005-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "安全测评报告.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  "C005-SUP-B": {
    status: "deviation",
    claimedScore: 0,
    attachmentName: "接口兼容说明.pdf",
    proofFingerprint: "PROOF-API-B",
  },
  "C008-SUP-A": {
    status: "compliant",
    claimedScore: 0,
    attachmentName: "等保三级备案证明.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  // 与华云数科同一指纹、同一附件名：跨供应商一稿多用，核验台需要暴露冲突来源。
  "C008-SUP-B": {
    status: "clarification",
    claimedScore: 0,
    attachmentName: "等保三级备案证明.pdf",
    proofFingerprint: "PROOF-SEC-CERT-2026",
  },
  "C010-SUP-B": {
    status: "compliant",
    claimedScore: 16,
    attachmentName: "服务方案.pdf",
    proofFingerprint: "PROOF-SERVICE-B",
  },
};

const reviewFactories: Array<{
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
}> = [
  {
    responseId: "C002-SUP-A",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 0,
    comment: "人员履历满足年限要求，社保材料与履历能够对应。",
    createdAt: "2026-09-28T09:10:00+08:00",
  },
  {
    responseId: "C002-SUP-A",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "clarification",
    score: 0,
    comment: "安全负责人项目经历需补充合同页或验收证明。",
    createdAt: "2026-09-28T10:25:00+08:00",
  },
  {
    responseId: "C003-SUP-A",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 13,
    comment: "里程碑和交付物完整，风险缓冲充分。",
    createdAt: "2026-09-28T11:10:00+08:00",
  },
  {
    responseId: "C003-SUP-A",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "compliant",
    score: 10,
    comment: "计划完整，但关键人员投入比例未量化。",
    createdAt: "2026-09-28T11:40:00+08:00",
  },
  {
    responseId: "C004-SUP-B",
    reviewer: "陈评审",
    role: "reviewer_a",
    decision: "compliant",
    score: 21,
    comment: "架构分层清晰，现有系统适配路径可验证。",
    createdAt: "2026-09-28T13:15:00+08:00",
  },
  {
    responseId: "C004-SUP-B",
    reviewer: "李评审",
    role: "reviewer_b",
    decision: "deviation",
    score: 15,
    comment: "高可用部署缺少跨机房切换演练记录。",
    createdAt: "2026-09-28T14:02:00+08:00",
  },
];

const clarifications: Clarification[] = [
  {
    id: "CL-001",
    responseId: "C002-SUP-A",
    clauseId: "C002",
    round: 1,
    requestText: "补充安全负责人近五年的同类项目合同页或验收证明。",
    requestedAt: "2026-09-27T09:00:00+08:00",
    dueAt: "2026-09-28T18:00:00+08:00",
    status: "overdue",
  },
  {
    id: "CL-002",
    responseId: "C008-SUP-B",
    clauseId: "C008",
    round: 1,
    requestText: "提供等保测评结论页及有效期说明。",
    requestedAt: "2026-09-28T14:30:00+08:00",
    dueAt: "2026-10-02T18:00:00+08:00",
    status: "open",
  },
  {
    id: "CL-003",
    responseId: "C009-SUP-C",
    clauseId: "C009",
    round: 2,
    requestText: "补充重大漏洞四小时通报的流程截图。",
    supplierResponse: "已补充值班表、升级路径和平台告警截图。",
    requestedAt: "2026-09-26T15:00:00+08:00",
    dueAt: "2026-09-28T18:00:00+08:00",
    respondedAt: "2026-09-27T14:20:00+08:00",
    status: "responded",
  },
];

/**
 * 材料更新种子：C004-SUP-B 的附件已更新到 revision 2，
 * revision 1 上的核验单与未定稿意见全部失效，转入待重评。
 */
const updatedMaterialSeeds: Record<
  string,
  {
    revision: number;
    attachmentName: string;
    updatedAt: string;
    updatedBy: string;
    previousAttachmentName: string;
  }
> = {
  "PROOF-C004-SUP-B": {
    revision: 2,
    attachmentName: "架构互操作补充证明（盖章版）.pdf",
    updatedAt: "2026-09-30T10:00:00+08:00",
    updatedBy: "北辰信息投标专员",
    previousAttachmentName: "北辰信息-B.1-证明材料.pdf",
  },
};

const makeResponse = (
  clause: Clause,
  supplierIndex: number,
  clauseIndex: number,
): SupplierResponse => {
  const supplier = suppliers[supplierIndex];
  const id = `${clause.id}-${supplier.id}`;
  const defaultStatus: ComplianceStatus =
    clause.type === "mandatory" ? "compliant" : "pending";
  const maxScore = clause.weight;
  const scorePattern = [
    Math.round(maxScore * 0.8),
    Math.round(maxScore * 0.72),
    Math.round(maxScore * 0.64),
  ];
  const override = responseOverrides[id] ?? {};
  const base: SupplierResponse = {
    id,
    clauseId: clause.id,
    supplierId: supplier.id,
    supplierName: supplier.name,
    status: override.status ?? defaultStatus,
    responseText:
      clause.type === "mandatory"
        ? `${supplier.name}已按采购要求提交说明与支持材料。`
        : `${supplier.name}提交响应正文，并声明可满足条款要求，分值依据需评审员复核。`,
    claimedScore: override.claimedScore ?? scorePattern[supplierIndex] ?? 0,
    attachmentName:
      override.attachmentName ?? `${supplier.name}-${clause.code}-证明材料.pdf`,
    proofFingerprint:
      override.proofFingerprint ?? `PROOF-${clause.id}-${supplier.id}`,
    submittedBy: `${supplier.name}投标专员`,
    submittedAt: `2026-09-${String(22 + ((clauseIndex + supplierIndex) % 4)).padStart(2, "0")}T16:20:00+08:00`,
    reviewRound: 1,
    reviews: [],
    clarifications: [],
  };
  base.reviews = reviewFactories
    .filter((item) => item.responseId === id)
    .map((item, index) => ({
      id: `OP-${id}-${index + 1}`,
      ...item,
      superseded: false,
    }));
  base.clarifications = clarifications.filter((item) => item.responseId === id);
  return base;
};

const responses: SupplierResponse[] = clauses.flatMap((clause, clauseIndex) =>
  suppliers.map((_supplier, supplierIndex) =>
    makeResponse(clause, supplierIndex, clauseIndex),
  ),
);

// 应用材料更新：响应附件回写为新版本，revision 1 上的未定稿意见失效。
const architectureResponse = responses.find(
  (item) => item.id === "C004-SUP-B",
);
if (architectureResponse) {
  const update = updatedMaterialSeeds[architectureResponse.proofFingerprint];
  if (update) {
    architectureResponse.attachmentName = update.attachmentName;
    architectureResponse.reviewRound = 2;
    architectureResponse.status = "pending";
    architectureResponse.reviews = architectureResponse.reviews.map(
      (review) =>
        ({
          ...review,
          superseded: true,
          supersedeReason:
            "证明材料附件更新到 revision 2 后，未定稿评审意见失效，需按新材料重评。",
        }) satisfies ReviewerOpinion,
    );
  }
}

// 同一指纹首次出现汇成一条材料记录。
const buildMaterials = (): {
  materials: ProofMaterial[];
  fingerprintToId: Map<string, string>;
} => {
  const materials: ProofMaterial[] = [];
  const fingerprintToId = new Map<string, string>();
  responses.forEach((response) => {
    const fingerprint = response.proofFingerprint;
    if (!fingerprint || fingerprintToId.has(fingerprint)) {
      return;
    }
    const sequence = materials.length + 1;
    const id = `MAT-${String(sequence).padStart(3, "0")}`;
    const update = updatedMaterialSeeds[fingerprint];
    materials.push({
      id,
      fingerprint,
      attachmentName: update?.attachmentName ?? response.attachmentName,
      revision: update?.revision ?? 1,
      firstSeenAt: response.submittedAt,
      updatedAt: update?.updatedAt ?? response.submittedAt,
      updatedBy: update?.updatedBy ?? response.submittedBy,
    });
    fingerprintToId.set(fingerprint, id);
  });
  return { materials, fingerprintToId };
};

const { materials, fingerprintToId } = buildMaterials();

interface ConfirmationSeed {
  ticketId: string;
  fingerprint: string;
  responseId: string;
  supplierId: string;
  clauseIds: string[];
  note: string;
  confirmedBy: string;
  confirmedAt: string;
  status: "active" | "invalidated";
  materialRevision: number;
  invalidatedAt?: string;
  invalidatedReason?: string;
}

const confirmationSeeds: ConfirmationSeed[] = [
  {
    ticketId: "TK-SEED-001",
    fingerprint: "PROOF-SEC-CERT-2026",
    responseId: "C005-SUP-A",
    supplierId: "SUP-A",
    clauseIds: ["C005", "C008"],
    note: "华云数科声明安全测评报告可同时覆盖接口标准与等保三级条款。",
    confirmedBy: "华云数科投标专员",
    confirmedAt: "2026-09-24T10:05:00+08:00",
    status: "active",
    materialRevision: 1,
  },
  {
    ticketId: "TK-SEED-002",
    fingerprint: "PROOF-PLAN-A",
    responseId: "C001-SUP-A",
    supplierId: "SUP-A",
    clauseIds: ["C001"],
    note: "项目组织方案仅适用于 A.1 实施组织条款。",
    confirmedBy: "华云数科投标专员",
    confirmedAt: "2026-09-23T09:30:00+08:00",
    status: "active",
    materialRevision: 1,
  },
  {
    ticketId: "TK-SEED-003",
    fingerprint: "PROOF-PLAN-B",
    responseId: "C001-SUP-B",
    supplierId: "SUP-B",
    clauseIds: ["C001"],
    note: "实施组织与计划仅适用于 A.1 条款。",
    confirmedBy: "北辰信息投标专员",
    confirmedAt: "2026-09-23T10:10:00+08:00",
    status: "active",
    materialRevision: 1,
  },
  {
    ticketId: "TK-SEED-004",
    fingerprint: "PROOF-C002-SUP-A",
    responseId: "C002-SUP-A",
    supplierId: "SUP-A",
    clauseIds: ["C002"],
    note: "关键人员履历与社保证明适用于 A.1.1 条款。",
    confirmedBy: "华云数科投标专员",
    confirmedAt: "2026-09-24T11:00:00+08:00",
    status: "active",
    materialRevision: 1,
  },
  {
    ticketId: "TK-SEED-005",
    fingerprint: "PROOF-C003-SUP-A",
    responseId: "C003-SUP-A",
    supplierId: "SUP-A",
    clauseIds: ["C003"],
    note: "里程碑计划适用于 A.1.2 评分项。",
    confirmedBy: "华云数科投标专员",
    confirmedAt: "2026-09-24T11:20:00+08:00",
    status: "active",
    materialRevision: 1,
  },
  {
    ticketId: "TK-SEED-006",
    fingerprint: "PROOF-C004-SUP-B",
    responseId: "C004-SUP-B",
    supplierId: "SUP-B",
    clauseIds: ["C004"],
    note: "架构证明材料初版适用于 B.1 技术架构条款。",
    confirmedBy: "北辰信息投标专员",
    confirmedAt: "2026-09-24T14:00:00+08:00",
    status: "invalidated",
    materialRevision: 1,
    invalidatedAt: "2026-09-30T10:00:00+08:00",
    invalidatedReason: "证明材料附件更新到 revision 2，原核验单失效。",
  },
  {
    ticketId: "TK-SEED-007",
    fingerprint: "PROOF-C004-SUP-B",
    responseId: "C004-SUP-B",
    supplierId: "SUP-B",
    clauseIds: ["C004"],
    note: "盖章版补充证明覆盖 B.1 技术架构与互操作性条款，旧意见需重评。",
    confirmedBy: "北辰信息投标专员",
    confirmedAt: "2026-09-30T11:00:00+08:00",
    status: "active",
    materialRevision: 2,
  },
];

const scopeConfirmations: ScopeConfirmation[] = confirmationSeeds.map(
  (seed, index) => ({
    id: `SC-${String(index + 1).padStart(3, "0")}`,
    ticketId: seed.ticketId,
    materialId: fingerprintToId.get(seed.fingerprint) ?? "",
    materialRevision: seed.materialRevision,
    responseId: seed.responseId,
    supplierId: seed.supplierId,
    clauseIds: [...seed.clauseIds],
    note: seed.note,
    confirmedBy: seed.confirmedBy,
    confirmedAt: seed.confirmedAt,
    status: seed.status,
    invalidatedAt: seed.invalidatedAt,
    invalidatedReason: seed.invalidatedReason,
  }),
);

// 跨供应商并发确认同一指纹：北辰信息（后到）保留填写内容，并看到华云数科的冲突来源。
const scopeConflicts: ScopeConflict[] = [
  {
    id: "CF-001",
    materialId: fingerprintToId.get("PROOF-SEC-CERT-2026") ?? "",
    supplierId: "SUP-B",
    responseId: "C008-SUP-B",
    ticketId: "TK-CONFLICT-001",
    conflictingBy: "华云数科投标专员",
    conflictingAt: "2026-10-01T09:20:00+08:00",
    conflictingSupplierId: "SUP-A",
    conflictingClauseIds: ["C005", "C008"],
    attemptedClauseIds: ["C008"],
    attemptedNote:
      "北辰信息声明该等保三级备案证明仅适用于 C.1.1，附件与华云数科同名需核验来源。",
    status: "open",
  },
];

// V1 定稿快照：盖章版本继续保留原材料（revision 1、旧附件名），不随后续更新变化。
const buildSealedProofs = (): SealedProof[] =>
  materials.map((material) => {
    const update = updatedMaterialSeeds[material.fingerprint];
    const responseIds = responses
      .filter((response) => response.proofFingerprint === material.fingerprint)
      .map((response) => response.id);
    return {
      fingerprint: material.fingerprint,
      attachmentName: update?.previousAttachmentName ?? material.attachmentName,
      revision: 1,
      responseIds,
    };
  });

const versions: ReviewDatabase["versions"] = [
  {
    id: "VER-001",
    version: "V1",
    label: "初审问题定位版本",
    status: "finalized",
    createdAt: "2026-09-25T17:30:00+08:00",
    createdBy: "采购工作组",
    signedBy: ["采购负责人", "技术评审组长"],
    clauseCount: clauses.length,
    responseCount: responses.length,
    contentHash: "a84f2d17",
    sealedProofs: buildSealedProofs(),
  },
  {
    id: "VER-002",
    version: "V2",
    label: "澄清与评分复核工作版",
    status: "draft",
    createdAt: "2026-09-29T08:10:00+08:00",
    createdBy: "采购工作组",
    signedBy: [],
    clauseCount: clauses.length,
    responseCount: responses.length,
    contentHash: "d91c6b42",
    sealedProofs: [],
  },
];

const auditLogs: AuditLog[] = [
  {
    id: "AUD-001",
    at: "2026-09-25T17:30:00+08:00",
    actor: "采购负责人",
    action: "版本定稿",
    entity: "VER-001",
    detail: "初审问题定位版本签署锁定，证明材料按 revision 1 留存盖章快照。",
  },
  {
    id: "AUD-002",
    at: "2026-09-27T09:00:00+08:00",
    actor: "采购专员",
    action: "发起澄清",
    entity: "CL-001",
    detail: "要求华云数科补充关键人员项目经历证明。",
  },
  {
    id: "AUD-003",
    at: "2026-09-28T10:25:00+08:00",
    actor: "李评审",
    action: "提交独立意见",
    entity: "C002-SUP-A",
    detail: "建议待澄清，与陈评审的符合结论形成分歧。",
  },
  {
    id: "AUD-004",
    at: "2026-09-29T08:10:00+08:00",
    actor: "采购工作组",
    action: "创建工作版本",
    entity: "VER-002",
    detail: "创建 V2 工作版本，保留 V1 定稿快照。",
  },
  {
    id: "AUD-005",
    at: "2026-09-30T10:00:00+08:00",
    actor: "北辰信息投标专员",
    action: "更新证明材料",
    entity: fingerprintToId.get("PROOF-C004-SUP-B") ?? "MAT",
    detail:
      "架构证明附件更新到 revision 2，原核验单失效、未定稿意见转入待重评；V1 盖章快照保留原材料。",
  },
  {
    id: "AUD-006",
    at: "2026-10-01T09:20:00+08:00",
    actor: "北辰信息投标专员",
    action: "适用范围冲突",
    entity: "CF-001",
    detail:
      "同一指纹已由华云数科确认覆盖 B.1.1、C.1.1，北辰信息的填写内容已保留，待核验台处理。",
  },
];

const buildSeed = (): ReviewDatabase => ({
  clauses: structuredClone(clauses),
  responses: structuredClone(responses),
  versions: structuredClone(versions),
  auditLogs: structuredClone(auditLogs),
  suppliers: structuredClone(suppliers),
  materials: structuredClone(materials),
  scopeConfirmations: structuredClone(scopeConfirmations),
  scopeConflicts: structuredClone(scopeConflicts),
});

/** 为旧版 runtime-data.json 补齐核验台字段。 */
const normalizeDatabase = (database: ReviewDatabase): ReviewDatabase => {
  database.materials ??= [];
  database.scopeConfirmations ??= [];
  database.scopeConflicts ??= [];
  database.versions.forEach((version) => {
    version.sealedProofs ??= [];
  });
  database.responses.forEach((response) => {
    response.reviews.forEach((review) => {
      review.superseded ??= false;
    });
  });
  return database;
};

class ReviewDataStore {
  private readonly runtimePath = join(process.cwd(), "server", "runtime-data.json");
  private data: ReviewDatabase;

  constructor() {
    if (existsSync(this.runtimePath)) {
      try {
        this.data = normalizeDatabase(
          JSON.parse(readFileSync(this.runtimePath, "utf8")) as ReviewDatabase,
        );
      } catch {
        this.data = buildSeed();
      }
    } else {
      this.data = buildSeed();
    }
  }

  snapshot(): ReviewDatabase {
    return structuredClone(this.data);
  }

  mutate<T>(work: (database: ReviewDatabase) => T): T {
    const result = work(this.data);
    writeFileSync(this.runtimePath, JSON.stringify(this.data, null, 2), "utf8");
    return result;
  }

  reset(): ReviewDatabase {
    this.data = buildSeed();
    writeFileSync(this.runtimePath, JSON.stringify(this.data, null, 2), "utf8");
    return this.snapshot();
  }
}

export const reviewDataStore = new ReviewDataStore();

export const createAudit = (
  database: ReviewDatabase,
  actor: string,
  action: string,
  entity: string,
  detail: string,
): void => {
  database.auditLogs.unshift({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor,
    action,
    entity,
    detail,
  });
};

export const createOpinionId = (): string =>
  `OP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createClarificationId = (): string =>
  `CL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createConfirmationId = (): string =>
  `SC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export const createConflictId = (): string =>
  `CF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
