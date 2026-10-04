import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import {
  type Clause,
  type Clarification,
  type ScopeConflict,
  type SupplierResponse,
} from "../../core/models/review.models";
import {
  hasReviewDifference,
  selectAuditLogs,
  selectClauses,
  selectDashboard,
  selectError,
  selectLoading,
  selectMaterials,
  selectOpenScopeConflicts,
  selectPendingClarifications,
  selectPendingReReviewResponses,
  selectRole,
  selectScopeConfirmations,
  selectVersions,
} from "../../core/state/review.selectors";
import {
  ClarificationTagComponent,
  ScopeConflictTagComponent,
  StatusTagComponent,
} from "../../shared/status-tag.component";

interface PendingIssue {
  clause: Clause;
  response: SupplierResponse;
  clarification: Clarification;
}

@Component({
  selector: "app-dashboard-page",
  imports: [
    RouterLink,
    DatePipe,
    ButtonModule,
    ProgressBarModule,
    TableModule,
    TagModule,
    StatusTagComponent,
    ClarificationTagComponent,
    ScopeConflictTagComponent,
  ],
  templateUrl: "./dashboard.page.html",
  styleUrl: "./dashboard.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  private readonly store = inject(Store);

  readonly dashboard = toSignal(this.store.select(selectDashboard), {
    initialValue: undefined,
  });
  readonly clauses = toSignal(this.store.select(selectClauses), {
    initialValue: [],
  });
  readonly versions = toSignal(this.store.select(selectVersions), {
    initialValue: [],
  });
  readonly auditLogs = toSignal(this.store.select(selectAuditLogs), {
    initialValue: [],
  });
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });
  readonly loading = toSignal(this.store.select(selectLoading), {
    initialValue: true,
  });
  readonly error = toSignal(this.store.select(selectError), {
    initialValue: undefined,
  });
  readonly pendingClarifications = toSignal(
    this.store.select(selectPendingClarifications),
    { initialValue: [] as PendingIssue[] },
  );
  readonly materials = toSignal(this.store.select(selectMaterials), {
    initialValue: [],
  });
  readonly confirmations = toSignal(
    this.store.select(selectScopeConfirmations),
    { initialValue: [] },
  );
  readonly openConflicts = toSignal(
    this.store.select(selectOpenScopeConflicts),
    { initialValue: [] as ScopeConflict[] },
  );
  readonly pendingReReviews = toSignal(
    this.store.select(selectPendingReReviewResponses),
    { initialValue: [] },
  );
  /** 材料覆盖范围：指纹 → 已确认供应商 / 条款。 */
  readonly materialScopes = computed(() => {
    const materials = this.materials();
    return materials.map((material) => {
      const active = this.confirmations().filter(
        (item) =>
          item.materialId === material.id && item.status === "active",
      );
      const usages = this.clauses().flatMap((clause) =>
        clause.responses
          .filter(
            (response) => response.proofFingerprint === material.fingerprint,
          )
          .map((response) => ({ clause, response })),
      );
      const supplierNames = Array.from(
        new Set(
          active.map((item) =>
            usages.find(
              ({ response }) => response.supplierId === item.supplierId,
            )?.response.supplierName,
          ),
        ),
      ).filter((name): name is string => Boolean(name));
      const clauseLabels = Array.from(
        new Set(
          active.flatMap((item) =>
            item.clauseIds
              .map((clauseId) => {
                const clause = this.clauses().find(
                  (entry) => entry.id === clauseId,
                );
                return clause ? `${clause.code} ${clause.title}` : "";
              })
              .filter(Boolean),
          ),
        ),
      );
      const pendingCount = usages.filter(
        ({ response }) =>
          !active.some(
            (item) =>
              item.supplierId === response.supplierId &&
              item.clauseIds.includes(response.clauseId),
          ),
      ).length;
      return {
        material,
        usages,
        supplierNames,
        clauseLabels,
        pendingCount,
        conflictCount: this.openConflicts().filter(
          (conflict) => conflict.materialId === material.id,
        ).length,
      };
    });
  });
  readonly differences = computed(() =>
    this.clauses().flatMap((clause) =>
      clause.responses
        .filter(hasReviewDifference)
        .map((response) => ({ clause, response })),
    ),
  );
  readonly mandatoryGaps = computed(() =>
    this.clauses()
      .filter((clause) => clause.type === "mandatory")
      .flatMap((clause) =>
        clause.responses
          .filter(
            (response) =>
              response.status === "pending" ||
              response.status === "clarification",
          )
          .map((response) => ({ clause, response })),
      ),
  );
  readonly completion = computed(() => {
    const clauses = this.clauses();
    if (clauses.length === 0) {
      return 0;
    }
    const reviewed = clauses.filter((clause) =>
      clause.responses.every((response) => response.reviews.length > 0),
    ).length;
    return Math.round((reviewed / clauses.length) * 100);
  });
}
