import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { CheckboxModule } from "primeng/checkbox";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { TextareaModule } from "primeng/textarea";
import {
  roleProfiles,
  type Clause,
  type MaterialCoverage,
  type ProofMaterial,
  type ScopeConflict,
  type SupplierResponse,
} from "../../core/models/review.models";
import { ReviewActions } from "../../core/state/review.actions";
import {
  activeConfirmationForResponse,
  selectClauses,
  selectDashboard,
  selectMaterials,
  selectOpenScopeConflicts,
  selectRole,
  selectScopeConfirmations,
  selectSuppliers,
} from "../../core/state/review.selectors";
import {
  ScopeConfirmationTagComponent,
  ScopeConflictTagComponent,
} from "../../shared/status-tag.component";

interface UsageView {
  response: SupplierResponse;
  clause: Clause;
  pending: boolean;
  pendingReReview: boolean;
}

interface CoverageRow extends MaterialCoverage {
  usages: Array<{
    responseId: string;
    clauseId: string;
    supplierId: string;
    supplierName: string;
    clauseCode: string;
    clauseTitle: string;
    currentFingerprint: string;
    currentAttachmentName: string;
  }>;
  usageViews: UsageView[];
  supplierCount: number;
  clauseCount: number;
  reused: boolean;
}

type CoverageFilter = "all" | "pending" | "reused" | "conflict" | "rereview";

@Component({
  selector: "app-coverage-page",
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    ScopeConfirmationTagComponent,
    ScopeConflictTagComponent,
  ],
  templateUrl: "./coverage.page.html",
  styleUrl: "./coverage.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoveragePage {
  private readonly store = inject(Store);

  readonly dashboard = toSignal(this.store.select(selectDashboard), {
    initialValue: undefined,
  });
  readonly clauses = toSignal(this.store.select(selectClauses), {
    initialValue: [],
  });
  readonly suppliers = toSignal(this.store.select(selectSuppliers), {
    initialValue: [],
  });
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
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "procurement",
  });

  readonly filter = signal<CoverageFilter>("all");
  readonly filterOptions: Array<{ label: string; value: CoverageFilter }> = [
    { label: "全部材料", value: "all" },
    { label: "待确认适用范围", value: "pending" },
    { label: "一稿多用", value: "reused" },
    { label: "存在冲突", value: "conflict" },
    { label: "待重评", value: "rereview" },
  ];
  readonly keyword = signal("");

  readonly confirmVisible = signal(false);
  readonly updateVisible = signal(false);
  readonly activeRow = signal<CoverageRow | null>(null);
  readonly activeUsage = signal<UsageView | null>(null);
  readonly activeMaterial = signal<ProofMaterial | null>(null);
  /** 当前核验单 ticketId：保存失败和冲突后沿用，成功后才更换。 */
  readonly activeTicketId = signal("");
  readonly activeConflict = signal<ScopeConflict | null>(null);
  readonly selectedClauseIds = signal<Record<string, boolean>>({});

  readonly confirmForm = new FormGroup({
    note: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4)],
    }),
  });

  readonly updateForm = new FormGroup({
    attachmentName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(4)],
    }),
    fingerprint: new FormControl("", { nonNullable: true }),
  });

  readonly canMaintain = computed(() =>
    ["procurement", "chair"].includes(this.role()),
  );

  private readonly clauseById = computed(() => {
    const map = new Map<string, Clause>();
    this.clauses().forEach((clause) => map.set(clause.id, clause));
    return map;
  });

  readonly rows = computed<CoverageRow[]>(() => {
    const materials = this.materials();
    const confirmations = this.confirmations();
    return materials.map((material) => {
      const usageViews: UsageView[] = [];
      const responseIds = new Set<string>();
      const supplierIds = new Set<string>();
      const clauseIds = new Set<string>();
      this.clauses().forEach((clause) => {
        clause.responses.forEach((response) => {
          if (response.proofFingerprint !== material.fingerprint) {
            return;
          }
          const confirmation = activeConfirmationForResponse(
            confirmations,
            materials,
            response,
          );
          const covered = Boolean(confirmation);
          usageViews.push({
            response,
            clause,
            pending: !covered,
            pendingReReview: response.pendingReReview,
          });
          responseIds.add(response.id);
          supplierIds.add(response.supplierId);
          clauseIds.add(response.clauseId);
        });
      });

      const active = confirmations.filter(
        (item) =>
          item.materialId === material.id && item.status === "active",
      );
      const invalidated = confirmations.filter(
        (item) =>
          item.materialId === material.id &&
          item.status === "invalidated",
      );
      const conflicts = this.openConflicts().filter(
        (item) => item.materialId === material.id,
      );
      const coveredSupplierIds = Array.from(
        new Set(active.map((item) => item.supplierId)),
      );
      const coveredClauseIds = Array.from(
        new Set(active.flatMap((item) => item.clauseIds)),
      );
      const coveredSupplierNames = coveredSupplierIds.map(
        (supplierId) =>
          this.suppliers().find((supplier) => supplier.id === supplierId)
            ?.name ?? supplierId,
      );
      const coveredClauseLabels = coveredClauseIds.map((clauseId) => {
        const clause = this.clauseById().get(clauseId);
        return clause ? `${clause.code} ${clause.title}` : clauseId;
      });
      const pendingResponseIds = usageViews
        .filter((usage) => usage.pending)
        .map((usage) => usage.response.id);
      const pendingReReviewCount = usageViews.filter(
        (usage) => usage.pendingReReview,
      ).length;

      return {
        material,
        usages: usageViews.map((usage) => ({
          responseId: usage.response.id,
          clauseId: usage.clause.id,
          supplierId: usage.response.supplierId,
          supplierName: usage.response.supplierName,
          clauseCode: usage.clause.code,
          clauseTitle: usage.clause.title,
          currentFingerprint: usage.response.proofFingerprint,
          currentAttachmentName: usage.response.attachmentName,
        })),
        usageViews,
        activeConfirmations: active,
        invalidatedConfirmations: invalidated,
        openConflicts: conflicts,
        coveredSupplierIds,
        coveredClauseIds,
        coveredSupplierNames,
        coveredClauseLabels,
        pendingResponseIds,
        pendingReReviewCount,
        supplierCount: supplierIds.size,
        clauseCount: clauseIds.size,
        reused: responseIds.size > 1,
      };
    });
  });

  readonly filteredRows = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    return this.rows().filter((row) => {
      const matchesKeyword =
        !keyword ||
        [
          row.material.fingerprint,
          row.material.attachmentName,
          row.material.id,
          ...row.coveredSupplierNames,
          ...row.coveredClauseLabels,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      if (!matchesKeyword) {
        return false;
      }
      switch (this.filter()) {
        case "pending":
          return row.pendingResponseIds.length > 0;
        case "reused":
          return row.reused;
        case "conflict":
          return row.openConflicts.length > 0;
        case "rereview":
          return row.pendingReReviewCount > 0;
        default:
          return true;
      }
    });
  });

  readonly totalPendingReReviews = computed(
    () =>
      this.rows().reduce(
        (count, row) => count + row.pendingReReviewCount,
        0,
      ),
  );

  readonly allClauseOptions = computed(() =>
    this.clauses()
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((clause) => ({
        id: clause.id,
        label: `${clause.code} ${clause.title}`,
      })),
  );

  readonly selectedClauseCount = computed(
    () => Object.values(this.selectedClauseIds()).filter(Boolean).length,
  );

  readonly activeConflictSupplierName = computed(() => {
    const conflict = this.activeConflict();
    if (!conflict) {
      return "";
    }
    return (
      this.suppliers().find(
        (supplier) => supplier.id === conflict.conflictingSupplierId,
      )?.name ?? conflict.conflictingSupplierId
    );
  });

  readonly activeConflictClauseLabels = computed(() =>
    this.activeConflict()?.conflictingClauseIds.map((clauseId) => {
      const clause = this.clauseById().get(clauseId);
      return clause ? `${clause.code} ${clause.title}` : clauseId;
    }) ?? [],
  );

  setFilter(value: CoverageFilter): void {
    this.filter.set(value);
  }

  clauseChecked(clauseId: string): boolean {
    return Boolean(this.selectedClauseIds()[clauseId]);
  }

  toggleClause(clauseId: string, checked: boolean): void {
    this.selectedClauseIds.update((selections) => ({
      ...selections,
      [clauseId]: checked,
    }));
  }

  selectAllClauses(checked: boolean): void {
    const next: Record<string, boolean> = {};
    if (checked) {
      this.allClauseOptions().forEach((clause) => {
        next[clause.id] = true;
      });
    }
    this.selectedClauseIds.set(next);
  }

  openConfirm(row: CoverageRow, usage?: UsageView): void {
    const target = usage ?? row.usageViews.find((item) => item.pending);
    if (!target) {
      return;
    }
    this.activeRow.set(row);
    this.activeUsage.set(target);
    this.activeTicketId.set(this.createTicketId());
    this.activeConflict.set(
      row.openConflicts.find(
        (conflict) => conflict.supplierId === target.response.supplierId,
      ) ??
        row.openConflicts[0] ??
        null,
    );
    const previous = activeConfirmationForResponse(
      this.confirmations(),
      this.materials(),
      target.response,
    );
    const selections: Record<string, boolean> = {};
    const initialClauseIds =
      previous?.clauseIds ?? [target.response.clauseId];
    initialClauseIds.forEach((clauseId) => {
      selections[clauseId] = true;
    });
    this.selectedClauseIds.set(selections);
    this.confirmForm.reset({
      note: previous?.note ?? "",
    });
    this.confirmVisible.set(true);
  }

  submitConfirm(simulateFailure = false): void {
    const usage = this.activeUsage();
    if (!usage || this.confirmForm.invalid) {
      this.confirmForm.markAllAsTouched();
      return;
    }
    const clauseIds = Object.entries(this.selectedClauseIds())
      .filter(([, checked]) => checked)
      .map(([clauseId]) => clauseId);
    this.store.dispatch(
      ReviewActions.confirmScope({
        input: {
          ticketId: this.activeTicketId(),
          responseId: usage.response.id,
          clauseIds,
          note: this.confirmForm.controls.note.value,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
          simulateFailure,
        },
      }),
    );
  }

  /** 模拟保存失败：核验单编号保持不变，再次提交必须是同一张单。 */
  simulateFailedSave(): void {
    this.submitConfirm(true);
  }

  retryWithSameTicket(): void {
    this.submitConfirm(false);
  }

  openUpdate(row: CoverageRow): void {
    this.activeRow.set(row);
    this.activeMaterial.set(row.material);
    this.updateForm.reset({
      attachmentName: row.material.attachmentName,
      fingerprint: "",
    });
    this.updateVisible.set(true);
  }

  submitUpdate(): void {
    const material = this.activeMaterial();
    if (!material || this.updateForm.invalid) {
      this.updateForm.markAllAsTouched();
      return;
    }
    const fingerprint = this.updateForm.controls.fingerprint.value.trim();
    this.store.dispatch(
      ReviewActions.updateProofMaterial({
        input: {
          materialId: material.id,
          attachmentName: this.updateForm.controls.attachmentName.value,
          fingerprint: fingerprint || undefined,
          actor: roleProfiles[this.role()].name,
          role: this.role(),
        },
      }),
    );
    this.updateVisible.set(false);
  }

  resolveConflict(conflict: ScopeConflict): void {
    this.store.dispatch(ReviewActions.resolveScopeConflict({ conflict }));
    this.confirmVisible.set(false);
  }

  openConflictRetry(row: CoverageRow, conflict: ScopeConflict): void {
    const usage = row.usageViews.find(
      (item) => item.response.id === conflict.responseId,
    );
    if (!usage) {
      return;
    }
    this.activeRow.set(row);
    this.activeUsage.set(usage);
    // 后到一方沿用原核验单与已填写内容，只看到材料已变化。
    this.activeTicketId.set(conflict.ticketId);
    this.activeConflict.set(conflict);
    const selections: Record<string, boolean> = {};
    conflict.attemptedClauseIds.forEach((clauseId) => {
      selections[clauseId] = true;
    });
    this.selectedClauseIds.set(selections);
    this.confirmForm.reset({ note: conflict.attemptedNote });
    this.confirmVisible.set(true);
  }

  supplierName(supplierId: string): string {
    return (
      this.suppliers().find((supplier) => supplier.id === supplierId)?.name ??
      supplierId
    );
  }

  conflictingClauseLabel(conflict: ScopeConflict): string {
    return conflict.conflictingClauseIds
      .map((clauseId) => {
        const clause = this.clauseById().get(clauseId);
        return clause ? `${clause.code} ${clause.title}` : clauseId;
      })
      .join("、");
  }

  rowsForConflict(conflict: ScopeConflict): CoverageRow[] {
    const row = this.rows().find(
      (item) => item.material.id === conflict.materialId,
    );
    return row ? [row] : [];
  }

  trackRow(index: number, row: CoverageRow): string {
    return row.material.id;
  }

  private createTicketId(): string {
    return `TK-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
  }
}
