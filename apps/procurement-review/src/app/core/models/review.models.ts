export type ClauseType = "mandatory" | "scoring" | "evidence";
export type ComplianceStatus =
  | "compliant"
  | "deviation"
  | "clarification"
  | "pending";
export type ReviewRole =
  | "procurement"
  | "reviewer_a"
  | "reviewer_b"
  | "chair";
export type ClarificationStatus = "open" | "responded" | "overdue";
export type VersionStatus = "draft" | "finalized";
export type ScopeConfirmationStatus = "active" | "invalidated";
export type ScopeConflictStatus = "open" | "resolved";

export interface ReviewerOpinion {
  id: string;
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
  superseded: boolean;
  sealedByVersion?: string | null;
  supersedeReason?: string | null;
}

export interface Clarification {
  id: string;
  responseId: string;
  clauseId: string;
  round: number;
  requestText: string;
  supplierResponse?: string;
  requestedAt: string;
  dueAt: string;
  respondedAt?: string;
  status: ClarificationStatus;
}

export interface SupplierResponse {
  id: string;
  clauseId: string;
  supplierId: string;
  supplierName: string;
  status: ComplianceStatus;
  responseText: string;
  claimedScore: number;
  attachmentName: string;
  proofFingerprint: string;
  submittedBy: string;
  submittedAt: string;
  reviewRound: number;
  reviews: ReviewerOpinion[];
  clarifications: Clarification[];
  scopeConfirmed: boolean;
  scopeMatches: boolean;
  pendingReReview: boolean;
}

export interface Clause {
  id: string;
  code: string;
  title: string;
  category: string;
  requirement: string;
  type: ClauseType;
  weight: number;
  parentId?: string;
  evidenceRequired: boolean;
  order: number;
  responses: SupplierResponse[];
  children?: ClauseTreeNode[];
}

export interface ClauseTreeNode extends Clause {
  children: ClauseTreeNode[];
}

export interface SealedProof {
  fingerprint: string;
  attachmentName: string;
  revision: number;
  responseIds: string[];
}

export interface ReviewVersion {
  id: string;
  version: string;
  label: string;
  status: VersionStatus;
  createdAt: string;
  createdBy: string;
  signedBy: string[];
  clauseCount: number;
  responseCount: number;
  contentHash: string;
  sealedProofs: SealedProof[];
}

export interface AuditLog {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail: string;
}

export interface DashboardStats {
  totalClauses: number;
  mandatoryCount: number;
  pendingReviews: number;
  differences: number;
  overdueClarifications: number;
  reusedProofs: number;
  activeVersion: string;
  materialCount: number;
  pendingScopeConfirmations: number;
  pendingReReviews: number;
  openScopeConflicts: number;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface MaterialUsage {
  responseId: string;
  clauseId: string;
  supplierId: string;
  supplierName: string;
  clauseCode: string;
  clauseTitle: string;
  currentFingerprint: string;
  currentAttachmentName: string;
}

export interface ProofMaterial {
  id: string;
  fingerprint: string;
  attachmentName: string;
  revision: number;
  firstSeenAt: string;
  updatedAt: string;
  updatedBy: string;
  usages: MaterialUsage[];
}

export interface ScopeConfirmation {
  id: string;
  ticketId: string;
  materialId: string;
  materialRevision: number;
  responseId: string;
  supplierId: string;
  clauseIds: string[];
  note: string;
  confirmedBy: string;
  confirmedAt: string;
  status: ScopeConfirmationStatus;
  invalidatedAt?: string | null;
  invalidatedReason?: string | null;
}

export interface ScopeConflict {
  id: string;
  materialId: string;
  supplierId: string;
  responseId: string;
  ticketId: string;
  conflictingBy: string;
  conflictingAt: string;
  conflictingSupplierId: string;
  conflictingClauseIds: string[];
  attemptedClauseIds: string[];
  attemptedNote: string;
  status: ScopeConflictStatus;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface MaterialCoverage {
  material: ProofMaterial;
  activeConfirmations: ScopeConfirmation[];
  invalidatedConfirmations: ScopeConfirmation[];
  openConflicts: ScopeConflict[];
  coveredSupplierIds: string[];
  coveredClauseIds: string[];
  coveredSupplierNames: string[];
  coveredClauseLabels: string[];
  pendingResponseIds: string[];
  pendingReReviewCount: number;
}

export interface ClauseFilters {
  keyword: string;
  category: string;
  type: ClauseType | "all";
  differencesOnly: boolean;
}

export interface ReviewState {
  clauses: Clause[];
  versions: ReviewVersion[];
  auditLogs: AuditLog[];
  dashboard?: DashboardStats;
  suppliers: Supplier[];
  materials: ProofMaterial[];
  scopeConfirmations: ScopeConfirmation[];
  scopeConflicts: ScopeConflict[];
  materialCoverages: MaterialCoverage[];
  filters: ClauseFilters;
  role: ReviewRole;
  selectedSupplierIds: string[];
  loading: boolean;
  saving: boolean;
  error?: string;
  toast?: string;
}

export interface WorkspaceQueryResult {
  workspace: {
    clauses: Clause[];
    versions: ReviewVersion[];
    auditLogs: AuditLog[];
    dashboard: DashboardStats;
    suppliers: Supplier[];
    materials: ProofMaterial[];
    scopeConfirmations: ScopeConfirmation[];
    scopeConflicts: ScopeConflict[];
    materialCoverages: MaterialCoverage[];
  };
}

export interface AssessmentInput {
  responseId: string;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  reviewer: string;
  role: ReviewRole;
}

export interface ClarificationInput {
  responseId: string;
  requestText: string;
  dueAt: string;
  actor: string;
}

export interface ClarificationResponseInput {
  clarificationId: string;
  responseText: string;
  actor: string;
}

export interface FinalizeVersionInput {
  label: string;
  actor: string;
  role: ReviewRole;
}

export interface ConfirmScopeInput {
  ticketId: string;
  responseId: string;
  clauseIds: string[];
  note: string;
  actor: string;
  role: ReviewRole;
  simulateFailure?: boolean;
}

export interface UpdateProofMaterialInput {
  materialId: string;
  fingerprint?: string;
  attachmentName: string;
  actor: string;
  role: ReviewRole;
}

export interface ScopeConfirmResult {
  confirmation: ScopeConfirmation | null;
  conflict: ScopeConflict | null;
  materialRevision: number;
  materialChanged: boolean;
  reusedTicket: boolean;
}

export const roleProfiles: Record<ReviewRole, { name: string; label: string }> = {
  procurement: { name: "采购专员", label: "采购人员" },
  reviewer_a: { name: "陈评审", label: "技术评审员 A" },
  reviewer_b: { name: "李评审", label: "技术评审员 B" },
  chair: { name: "赵主任", label: "评审组长" },
};

export const complianceLabels: Record<ComplianceStatus, string> = {
  compliant: "符合",
  deviation: "偏离",
  clarification: "待澄清",
  pending: "待评审",
};

export const clauseTypeLabels: Record<ClauseType, string> = {
  mandatory: "否决项",
  scoring: "评分项",
  evidence: "证明项",
};

export const statusSeverity: Record<ComplianceStatus, string> = {
  compliant: "success",
  deviation: "danger",
  clarification: "warn",
  pending: "secondary",
};

export const scopeConfirmationLabels: Record<
  ScopeConfirmationStatus,
  string
> = {
  active: "核验通过",
  invalidated: "已失效",
};

export const scopeConflictLabels: Record<ScopeConflictStatus, string> = {
  open: "待处理",
  resolved: "已处理",
};
