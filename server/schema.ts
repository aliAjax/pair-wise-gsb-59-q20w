import { parse } from "graphql";

export const typeDefs = parse(`
  enum ClauseType {
    mandatory
    scoring
    evidence
  }

  enum ComplianceStatus {
    compliant
    deviation
    clarification
    pending
  }

  enum ReviewRole {
    procurement
    reviewer_a
    reviewer_b
    chair
  }

  enum ClarificationStatus {
    open
    responded
    overdue
  }

  enum VersionStatus {
    draft
    finalized
  }

  enum ScopeConfirmationStatus {
    active
    invalidated
  }

  enum ScopeConflictStatus {
    open
    resolved
  }

  type Clause {
    id: ID!
    code: String!
    title: String!
    category: String!
    requirement: String!
    type: ClauseType!
    weight: Int!
    parentId: String
    evidenceRequired: Boolean!
    order: Int!
    responses: [SupplierResponse!]!
  }

  type ReviewerOpinion {
    id: ID!
    responseId: String!
    reviewer: String!
    role: ReviewRole!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    createdAt: String!
    superseded: Boolean!
    sealedByVersion: String
    supersedeReason: String
  }

  type Clarification {
    id: ID!
    responseId: String!
    clauseId: String!
    round: Int!
    requestText: String!
    supplierResponse: String
    requestedAt: String!
    dueAt: String!
    respondedAt: String
    status: ClarificationStatus!
  }

  type SupplierResponse {
    id: ID!
    clauseId: String!
    supplierId: String!
    supplierName: String!
    status: ComplianceStatus!
    responseText: String!
    claimedScore: Int!
    attachmentName: String!
    proofFingerprint: String!
    submittedBy: String!
    submittedAt: String!
    reviewRound: Int!
    reviews: [ReviewerOpinion!]!
    clarifications: [Clarification!]!
    scopeConfirmed: Boolean!
    scopeMatches: Boolean!
    pendingReReview: Boolean!
  }

  type ProofMaterial {
    id: ID!
    fingerprint: String!
    attachmentName: String!
    revision: Int!
    firstSeenAt: String!
    updatedAt: String!
    updatedBy: String!
    usages: [MaterialUsage!]!
  }

  type MaterialUsage {
    responseId: String!
    clauseId: String!
    supplierId: String!
    supplierName: String!
    clauseCode: String!
    clauseTitle: String!
    currentFingerprint: String!
    currentAttachmentName: String!
  }

  type ScopeConfirmation {
    id: ID!
    ticketId: String!
    materialId: String!
    materialRevision: Int!
    responseId: String!
    supplierId: String!
    clauseIds: [String!]!
    note: String!
    confirmedBy: String!
    confirmedAt: String!
    status: ScopeConfirmationStatus!
    invalidatedAt: String
    invalidatedReason: String
    coversResponse(responseId: ID!): Boolean!
    coversClause(clauseId: ID!): Boolean!
  }

  type ScopeConflict {
    id: ID!
    materialId: String!
    supplierId: String!
    responseId: String!
    ticketId: String!
    conflictingBy: String!
    conflictingAt: String!
    conflictingSupplierId: String!
    conflictingClauseIds: [String!]!
    attemptedClauseIds: [String!]!
    attemptedNote: String!
    status: ScopeConflictStatus!
    resolvedAt: String
    resolvedBy: String
  }

  type SealedProof {
    fingerprint: String!
    attachmentName: String!
    revision: Int!
    responseIds: [String!]!
  }

  type ReviewVersion {
    id: ID!
    version: String!
    label: String!
    status: VersionStatus!
    createdAt: String!
    createdBy: String!
    signedBy: [String!]!
    clauseCount: Int!
    responseCount: Int!
    contentHash: String!
    sealedProofs: [SealedProof!]!
  }

  type AuditLog {
    id: ID!
    at: String!
    actor: String!
    action: String!
    entity: String!
    detail: String!
  }

  type DashboardStats {
    totalClauses: Int!
    mandatoryCount: Int!
    pendingReviews: Int!
    differences: Int!
    overdueClarifications: Int!
    reusedProofs: Int!
    activeVersion: String!
    materialCount: Int!
    pendingScopeConfirmations: Int!
    pendingReReviews: Int!
    openScopeConflicts: Int!
  }

  type Supplier {
    id: ID!
    name: String!
  }

  type MaterialCoverage {
    material: ProofMaterial!
    activeConfirmations: [ScopeConfirmation!]!
    invalidatedConfirmations: [ScopeConfirmation!]!
    openConflicts: [ScopeConflict!]!
    coveredSupplierIds: [String!]!
    coveredClauseIds: [String!]!
    coveredSupplierNames: [String!]!
    coveredClauseLabels: [String!]!
    pendingResponseIds: [String!]!
    pendingReReviewCount: Int!
  }

  type ScopeConfirmResult {
    confirmation: ScopeConfirmation
    conflict: ScopeConflict
    materialRevision: Int!
    materialChanged: Boolean!
    reusedTicket: Boolean!
  }

  type WorkspaceData {
    clauses: [Clause!]!
    versions: [ReviewVersion!]!
    auditLogs: [AuditLog!]!
    dashboard: DashboardStats!
    suppliers: [Supplier!]!
    materials: [ProofMaterial!]!
    scopeConfirmations: [ScopeConfirmation!]!
    scopeConflicts: [ScopeConflict!]!
    materialCoverages: [MaterialCoverage!]!
  }

  input AssessmentInput {
    responseId: ID!
    decision: ComplianceStatus!
    score: Int!
    comment: String!
    reviewer: String!
    role: ReviewRole!
  }

  input ClarificationInput {
    responseId: ID!
    requestText: String!
    dueAt: String!
    actor: String!
  }

  input ClarificationResponseInput {
    clarificationId: ID!
    responseText: String!
    actor: String!
  }

  input FinalizeVersionInput {
    label: String!
    actor: String!
    role: ReviewRole!
  }

  input ConfirmScopeInput {
    ticketId: ID!
    responseId: ID!
    clauseIds: [ID!]!
    note: String!
    actor: String!
    role: ReviewRole!
    simulateFailure: Boolean
  }

  input UpdateProofMaterialInput {
    materialId: ID!
    fingerprint: String
    attachmentName: String!
    actor: String!
    role: ReviewRole!
  }

  type Query {
    workspace: WorkspaceData!
    dashboard: DashboardStats!
  }

  type Mutation {
    submitAssessment(input: AssessmentInput!): ReviewerOpinion!
    requestClarification(input: ClarificationInput!): Clarification!
    respondClarification(input: ClarificationResponseInput!): Clarification!
    finalizeVersion(input: FinalizeVersionInput!): ReviewVersion!
    confirmScope(input: ConfirmScopeInput!): ScopeConfirmResult!
    updateProofMaterial(input: UpdateProofMaterialInput!): ProofMaterial!
    resolveScopeConflict(conflictId: ID!, actor: String!): ScopeConflict!
    resetReviewData: Boolean!
  }
`);
