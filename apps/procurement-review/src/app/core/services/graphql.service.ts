import { Injectable, inject } from "@angular/core";
import { Apollo, gql } from "apollo-angular";
import { Observable, map } from "rxjs";
import type {
  AssessmentInput,
  Clarification,
  ClarificationInput,
  ClarificationResponseInput,
  ConfirmScopeInput,
  FinalizeVersionInput,
  ProofMaterial,
  ReviewVersion,
  ReviewerOpinion,
  ScopeConfirmResult,
  ScopeConflict,
  UpdateProofMaterialInput,
  WorkspaceQueryResult,
} from "../models/review.models";

const WORKSPACE_QUERY = gql`
  query ProcurementReviewWorkspace {
    workspace {
      clauses {
        id
        code
        title
        category
        requirement
        type
        weight
        parentId
        evidenceRequired
        order
        responses {
          id
          clauseId
          supplierId
          supplierName
          status
          responseText
          claimedScore
          attachmentName
          proofFingerprint
          submittedBy
          submittedAt
          reviewRound
          scopeConfirmed
          scopeMatches
          pendingReReview
          reviews {
            id
            responseId
            reviewer
            role
            decision
            score
            comment
            createdAt
            superseded
            sealedByVersion
            supersedeReason
          }
          clarifications {
            id
            responseId
            clauseId
            round
            requestText
            supplierResponse
            requestedAt
            dueAt
            respondedAt
            status
          }
        }
      }
      versions {
        id
        version
        label
        status
        createdAt
        createdBy
        signedBy
        clauseCount
        responseCount
        contentHash
        sealedProofs {
          fingerprint
          attachmentName
          revision
          responseIds
        }
      }
      auditLogs {
        id
        at
        actor
        action
        entity
        detail
      }
      dashboard {
        totalClauses
        mandatoryCount
        pendingReviews
        differences
        overdueClarifications
        reusedProofs
        activeVersion
        materialCount
        pendingScopeConfirmations
        pendingReReviews
        openScopeConflicts
      }
      suppliers {
        id
        name
      }
      materials {
        id
        fingerprint
        attachmentName
        revision
        firstSeenAt
        updatedAt
        updatedBy
        usages {
          responseId
          clauseId
          supplierId
          supplierName
          clauseCode
          clauseTitle
          currentFingerprint
          currentAttachmentName
        }
      }
      scopeConfirmations {
        id
        ticketId
        materialId
        materialRevision
        responseId
        supplierId
        clauseIds
        note
        confirmedBy
        confirmedAt
        status
        invalidatedAt
        invalidatedReason
      }
      scopeConflicts {
        id
        materialId
        supplierId
        responseId
        ticketId
        conflictingBy
        conflictingAt
        conflictingSupplierId
        conflictingClauseIds
        attemptedClauseIds
        attemptedNote
        status
        resolvedAt
        resolvedBy
      }
      materialCoverages {
        coveredSupplierIds
        coveredClauseIds
        coveredSupplierNames
        coveredClauseLabels
        pendingResponseIds
        pendingReReviewCount
      }
    }
  }
`;

const SUBMIT_ASSESSMENT = gql`
  mutation SubmitAssessment($input: AssessmentInput!) {
    submitAssessment(input: $input) {
      id
      responseId
      reviewer
      role
      decision
      score
      comment
      createdAt
      superseded
      sealedByVersion
    }
  }
`;

const REQUEST_CLARIFICATION = gql`
  mutation RequestClarification($input: ClarificationInput!) {
    requestClarification(input: $input) {
      id
      responseId
      clauseId
      round
      requestText
      supplierResponse
      requestedAt
      dueAt
      respondedAt
      status
    }
  }
`;

const RESPOND_CLARIFICATION = gql`
  mutation RespondClarification($input: ClarificationResponseInput!) {
    respondClarification(input: $input) {
      id
      responseId
      clauseId
      round
      requestText
      supplierResponse
      requestedAt
      dueAt
      respondedAt
      status
    }
  }
`;

const FINALIZE_VERSION = gql`
  mutation FinalizeVersion($input: FinalizeVersionInput!) {
    finalizeVersion(input: $input) {
      id
      version
      label
      status
      createdAt
      createdBy
      signedBy
      clauseCount
      responseCount
      contentHash
      sealedProofs {
        fingerprint
        attachmentName
        revision
        responseIds
      }
    }
  }
`;

const CONFIRM_SCOPE = gql`
  mutation ConfirmScope($input: ConfirmScopeInput!) {
    confirmScope(input: $input) {
      confirmation {
        id
        ticketId
        materialId
        materialRevision
        responseId
        supplierId
        clauseIds
        note
        confirmedBy
        confirmedAt
        status
        invalidatedAt
        invalidatedReason
      }
      conflict {
        id
        materialId
        supplierId
        responseId
        ticketId
        conflictingBy
        conflictingAt
        conflictingSupplierId
        conflictingClauseIds
        attemptedClauseIds
        attemptedNote
        status
        resolvedAt
        resolvedBy
      }
      materialRevision
      materialChanged
      reusedTicket
    }
  }
`;

const UPDATE_PROOF_MATERIAL = gql`
  mutation UpdateProofMaterial($input: UpdateProofMaterialInput!) {
    updateProofMaterial(input: $input) {
      id
      fingerprint
      attachmentName
      revision
      firstSeenAt
      updatedAt
      updatedBy
    }
  }
`;

const RESOLVE_SCOPE_CONFLICT = gql`
  mutation ResolveScopeConflict($conflictId: ID!, $actor: String!) {
    resolveScopeConflict(conflictId: $conflictId, actor: $actor) {
      id
      status
      resolvedAt
      resolvedBy
    }
  }
`;

const RESET_REVIEW_DATA = gql`
  mutation ResetReviewData {
    resetReviewData
  }
`;

@Injectable({ providedIn: "root" })
export class ReviewGraphqlService {
  private readonly apollo = inject(Apollo);

  loadWorkspace(): Observable<WorkspaceQueryResult> {
    return this.apollo
      .query<WorkspaceQueryResult>({
        query: WORKSPACE_QUERY,
        fetchPolicy: "network-only",
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回评审工作区。");
          }
          return result.data as WorkspaceQueryResult;
        }),
      );
  }

  submitAssessment(input: AssessmentInput): Observable<ReviewerOpinion> {
    return this.apollo
      .mutate<{ submitAssessment: ReviewerOpinion }>({
        mutation: SUBMIT_ASSESSMENT,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回评审意见。");
          }
          return result.data.submitAssessment;
        }),
      );
  }

  requestClarification(input: ClarificationInput): Observable<Clarification> {
    return this.apollo
      .mutate<{ requestClarification: Clarification }>({
        mutation: REQUEST_CLARIFICATION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回澄清记录。");
          }
          return result.data.requestClarification;
        }),
      );
  }

  respondClarification(
    input: ClarificationResponseInput,
  ): Observable<Clarification> {
    return this.apollo
      .mutate<{ respondClarification: Clarification }>({
        mutation: RESPOND_CLARIFICATION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回澄清回复。");
          }
          return result.data.respondClarification;
        }),
      );
  }

  finalizeVersion(input: FinalizeVersionInput): Observable<ReviewVersion> {
    return this.apollo
      .mutate<{ finalizeVersion: ReviewVersion }>({
        mutation: FINALIZE_VERSION,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回版本信息。");
          }
          return result.data.finalizeVersion;
        }),
      );
  }

  confirmScope(input: ConfirmScopeInput): Observable<ScopeConfirmResult> {
    return this.apollo
      .mutate<{ confirmScope: ScopeConfirmResult }>({
        mutation: CONFIRM_SCOPE,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回核验结果。");
          }
          return result.data.confirmScope;
        }),
      );
  }

  updateProofMaterial(
    input: UpdateProofMaterialInput,
  ): Observable<ProofMaterial> {
    return this.apollo
      .mutate<{ updateProofMaterial: ProofMaterial }>({
        mutation: UPDATE_PROOF_MATERIAL,
        variables: { input },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回更新后的材料。");
          }
          return result.data.updateProofMaterial;
        }),
      );
  }

  resolveScopeConflict(
    conflictId: string,
    actor: string,
  ): Observable<ScopeConflict> {
    return this.apollo
      .mutate<{ resolveScopeConflict: ScopeConflict }>({
        mutation: RESOLVE_SCOPE_CONFLICT,
        variables: { conflictId, actor },
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回冲突处理结果。");
          }
          return result.data.resolveScopeConflict;
        }),
      );
  }

  resetReviewData(): Observable<boolean> {
    return this.apollo
      .mutate<{ resetReviewData: boolean }>({
        mutation: RESET_REVIEW_DATA,
        refetchQueries: ["ProcurementReviewWorkspace"],
      })
      .pipe(
        map((result) => {
          if (!result.data) {
            throw new Error("GraphQL 未返回重置结果。");
          }
          return result.data.resetReviewData;
        }),
      );
  }
}
