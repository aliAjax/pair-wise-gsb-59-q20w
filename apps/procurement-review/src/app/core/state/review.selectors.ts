import { createFeatureSelector, createSelector } from "@ngrx/store";
import type {
  Clause,
  ClauseTreeNode,
  ComplianceStatus,
  MaterialCoverage,
  ProofMaterial,
  ReviewState,
  ScopeConfirmation,
  ScopeConflict,
  SupplierResponse,
} from "../models/review.models";

export const selectReviewState =
  createFeatureSelector<ReviewState>("review");

export const selectClauses = createSelector(
  selectReviewState,
  (state) => state.clauses,
);

export const selectVersions = createSelector(
  selectReviewState,
  (state) => state.versions,
);

export const selectAuditLogs = createSelector(
  selectReviewState,
  (state) => state.auditLogs,
);

export const selectDashboard = createSelector(
  selectReviewState,
  (state) => state.dashboard,
);

export const selectSuppliers = createSelector(
  selectReviewState,
  (state) => state.suppliers,
);

export const selectFilters = createSelector(
  selectReviewState,
  (state) => state.filters,
);

export const selectRole = createSelector(
  selectReviewState,
  (state) => state.role,
);

export const selectSelectedSupplierIds = createSelector(
  selectReviewState,
  (state) => state.selectedSupplierIds,
);

export const selectLoading = createSelector(
  selectReviewState,
  (state) => state.loading,
);

export const selectSaving = createSelector(
  selectReviewState,
  (state) => state.saving,
);

export const selectError = createSelector(
  selectReviewState,
  (state) => state.error,
);

export const selectToast = createSelector(
  selectReviewState,
  (state) => state.toast,
);

export const selectMaterials = createSelector(
  selectReviewState,
  (state) => state.materials,
);

export const selectScopeConfirmations = createSelector(
  selectReviewState,
  (state) => state.scopeConfirmations,
);

export const selectScopeConflicts = createSelector(
  selectReviewState,
  (state) => state.scopeConflicts,
);

export const selectMaterialCoverages = createSelector(
  selectReviewState,
  (state) => state.materialCoverages,
);

/** 以 materialId 为键的覆盖范围索引（与 materials 顺序对齐）。 */
export const selectCoverageByMaterialId = createSelector(
  selectMaterialCoverages,
  (coverages) =>
    new Map<string, MaterialCoverage>(
      coverages.map((coverage) => [coverage.material.id, coverage]),
    ),
);

export const selectOpenScopeConflicts = createSelector(
  selectScopeConflicts,
  (conflicts) => conflicts.filter((conflict) => conflict.status === "open"),
);

export const selectPendingReReviewResponses = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter((response) => response.pendingReReview)
        .map((response) => ({ clause, response })),
    ),
);

export const selectUnscopedResponses = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter((response) => !response.scopeConfirmed)
        .map((response) => ({ clause, response })),
    ),
);

export const hasReviewDifference = (response: SupplierResponse): boolean => {
  const decisions = new Set(
    response.reviews
      .filter(
        (review) =>
          !review.superseded && review.decision !== "clarification",
      )
      .map((review) => review.decision),
  );
  return decisions.size > 1;
};

export const findResponse = (
  clause: Clause,
  supplierId: string,
): SupplierResponse | undefined =>
  clause.responses.find((response) => response.supplierId === supplierId);

const filteredClauses = createSelector(
  selectClauses,
  selectFilters,
  (clauses, filters) => {
    const keyword = filters.keyword.trim().toLowerCase();
    return clauses.filter((clause) => {
      const matchesKeyword =
        !keyword ||
        [
          clause.code,
          clause.title,
          clause.category,
          clause.requirement,
          ...clause.responses.map((response) => response.supplierName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesCategory =
        !filters.category || clause.category === filters.category;
      const matchesType =
        filters.type === "all" || clause.type === filters.type;
      const matchesDifference =
        !filters.differencesOnly ||
        clause.responses.some(hasReviewDifference);
      return (
        matchesKeyword &&
        matchesCategory &&
        matchesType &&
        matchesDifference
      );
    });
  },
);

export const selectFilteredClauses = filteredClauses;

export const selectClauseTree = createSelector(
  selectClauses,
  filteredClauses,
  (allClauses, matchingClauses): ClauseTreeNode[] => {
    if (matchingClauses.length === 0) {
      return [];
    }
    const includedIds = new Set<string>();
    const byId = new Map(allClauses.map((clause) => [clause.id, clause]));
    matchingClauses.forEach((clause) => {
      includedIds.add(clause.id);
      let parentId = clause.parentId;
      while (parentId && !includedIds.has(parentId)) {
        includedIds.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    });
    const selected = allClauses
      .filter((clause) => includedIds.has(clause.id))
      .sort((a, b) => a.order - b.order);
    const nodeMap = new Map<string, ClauseTreeNode>();
    selected.forEach((clause) => {
      nodeMap.set(clause.id, { ...clause, children: [] });
    });
    const roots: ClauseTreeNode[] = [];
    selected.forEach((clause) => {
      const node = nodeMap.get(clause.id);
      if (!node) {
        return;
      }
      if (clause.parentId && nodeMap.has(clause.parentId)) {
        nodeMap.get(clause.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  },
);

export const selectDifferences = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter(hasReviewDifference)
        .map((response) => ({ clause, response })),
    ),
);

export const selectPendingClarifications = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses.flatMap((response) =>
        response.clarifications
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          )
          .map((clarification) => ({
            clause,
            response,
            clarification,
          })),
      ),
    ),
);

export const selectReusedProofs = createSelector(
  selectClauses,
  (clauses) => {
    const counts = new Map<
      string,
      Array<{ clause: Clause; response: SupplierResponse }>
    >();
    clauses.forEach((clause) => {
      clause.responses.forEach((response) => {
        const current = counts.get(response.proofFingerprint) ?? [];
        current.push({ clause, response });
        counts.set(response.proofFingerprint, current);
      });
    });
    return Array.from(counts.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([fingerprint, entries]) => ({ fingerprint, entries }));
  },
);

export const responseDecisionSummary = (
  response: SupplierResponse,
): ComplianceStatus[] =>
  Array.from(
    new Set(
      response.reviews
        .filter((review) => !review.superseded)
        .map((review) => review.decision),
    ),
  );

/** 当前覆盖指定响应的生效核验单（同一材料、同供应商、条款在覆盖清单内）。 */
export const activeConfirmationForResponse = (
  confirmations: ScopeConfirmation[],
  materials: ProofMaterial[],
  response: SupplierResponse,
): ScopeConfirmation | undefined => {
  const material = materials.find(
    (item) => item.fingerprint === response.proofFingerprint,
  );
  if (!material) {
    return undefined;
  }
  return confirmations.find(
    (confirmation) =>
      confirmation.status === "active" &&
      confirmation.materialId === material.id &&
      confirmation.materialRevision === material.revision &&
      confirmation.supplierId === response.supplierId &&
      confirmation.clauseIds.includes(response.clauseId),
  );
};

export const isPendingReReview = (response: SupplierResponse): boolean =>
  response.pendingReReview;

export const isScopeConflictOpen = (conflict: ScopeConflict): boolean =>
  conflict.status === "open";
