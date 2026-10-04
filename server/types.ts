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
}

export interface ReviewerOpinion {
  id: string;
  responseId: string;
  reviewer: string;
  role: ReviewRole;
  decision: ComplianceStatus;
  score: number;
  comment: string;
  createdAt: string;
  /** 定稿之后的意见不会因材料更新失效；定稿前意见随未盖章核验单一并失效。 */
  superseded: boolean;
  sealedByVersion?: string;
  /** 失效原因，如“证明材料更新后核验单失效，待重评”。 */
  supersedeReason?: string;
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
  /** 是否存在生效的适用范围核验单（由核验台在查询时计算）。 */
  scopeConfirmed?: boolean;
  /** 生效核验单覆盖的供应商与条款与本响应是否一致。 */
  scopeMatches?: boolean;
  /** 材料更新后未定稿意见失效，需要重新评审。 */
  pendingReReview?: boolean;
}

/**
 * 证明材料记录：同一指纹首次出现时汇成一条记录，
 * 附件或指纹更新时 revision 递增，旧核验单随之失效。
 */
export interface ProofMaterial {
  id: string;
  fingerprint: string;
  attachmentName: string;
  revision: number;
  firstSeenAt: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * 适用范围核验单：供应商响应必须先确认材料覆盖哪些供应商和条款，
 * 才能进入评审。ticketId 保证保存失败重试不多出记录。
 */
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
  invalidatedAt?: string;
  invalidatedReason?: string;
}

/** 并发提交同一材料时记录冲突来源，后到一方保留填写内容并看到材料已变化。 */
export interface ScopeConflict {
  id: string;
  materialId: string;
  /** 后到一方（看到“材料已变化”的人）。 */
  supplierId: string;
  responseId: string;
  ticketId: string;
  /** 先到一方填写的内容，即冲突来源。 */
  conflictingBy: string;
  conflictingAt: string;
  conflictingSupplierId: string;
  conflictingClauseIds: string[];
  /** 后到一方在冲突瞬间保留下来的填写内容，重新提交时沿用。 */
  attemptedClauseIds: string[];
  attemptedNote: string;
  status: ScopeConflictStatus;
  resolvedAt?: string;
  resolvedBy?: string;
}

/** 定稿版本中的证明材料快照：盖章版本继续保留原材料，不随后续更新变化。 */
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

export interface ReviewDatabase {
  clauses: Clause[];
  responses: SupplierResponse[];
  versions: ReviewVersion[];
  auditLogs: AuditLog[];
  suppliers: Array<{ id: string; name: string }>;
  materials: ProofMaterial[];
  scopeConfirmations: ScopeConfirmation[];
  scopeConflicts: ScopeConflict[];
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
  /** 打开核验单时生成的幂等键，保存失败后沿用原核验单重试。 */
  ticketId: string;
  responseId: string;
  clauseIds: string[];
  note: string;
  actor: string;
  role: ReviewRole;
  /** 演示用：让本次保存失败，前端沿用同一 ticketId 重试不应多出记录。 */
  simulateFailure?: boolean;
}

export interface UpdateProofMaterialInput {
  materialId: string;
  /** 指纹为空时表示仅更新盖章附件名称。 */
  fingerprint?: string;
  attachmentName: string;
  actor: string;
  role: ReviewRole;
}
