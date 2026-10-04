import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { toSignal } from "@angular/core/rxjs-interop";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { SelectModule } from "primeng/select";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { ReviewActions } from "../../core/state/review.actions";
import {
  selectAuditLogs,
  selectClauses,
  selectMaterialCoverages,
  selectRole,
  selectVersions,
} from "../../core/state/review.selectors";
import { roleProfiles } from "../../core/models/review.models";

@Component({
  selector: "app-audit-page",
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: "./audit.page.html",
  styleUrl: "./audit.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditPage {
  private readonly store = inject(Store);

  readonly roleProfiles = roleProfiles;
  readonly logs = toSignal(this.store.select(selectAuditLogs), {
    initialValue: [],
  });
  readonly versions = toSignal(this.store.select(selectVersions), {
    initialValue: [],
  });
  readonly materialCoverages = toSignal(
    this.store.select(selectMaterialCoverages),
    { initialValue: [] },
  );
  readonly clauses = toSignal(this.store.select(selectClauses), {
    initialValue: [],
  });
  readonly coverageExportRows = computed(() =>
    this.materialCoverages().flatMap((coverage) =>
      coverage.activeConfirmations.map((confirmation) => ({
        materialId: coverage.material.id,
        fingerprint: coverage.material.fingerprint,
        attachmentName: coverage.material.attachmentName,
        revision: coverage.material.revision,
        ticketId: confirmation.ticketId,
        confirmedBy: confirmation.confirmedBy,
        supplierId: confirmation.supplierId,
        supplierName:
          coverage.coveredSupplierNames[
            coverage.coveredSupplierIds.indexOf(confirmation.supplierId)
          ] ?? confirmation.supplierId,
        clauseIds: confirmation.clauseIds.join(";"),
        confirmedAt: confirmation.confirmedAt,
        pendingReReview: coverage.pendingReReviewCount,
        conflictCount: coverage.openConflicts.length,
        note: confirmation.note,
      })),
    ),
  );
  readonly pendingReReviewExportRows = computed(() =>
    this.clauses().flatMap((clause) =>
      clause.responses
        .filter((response) => response.pendingReReview)
        .map((response) => ({
          responseId: response.id,
          clauseCode: clause.code,
          clauseTitle: clause.title,
          supplierName: response.supplierName,
          attachmentName: response.attachmentName,
          fingerprint: response.proofFingerprint,
          reviewRound: response.reviewRound,
        })),
    ),
  );
  readonly conflictExportRows = computed(() =>
    this.materialCoverages().flatMap((coverage) =>
      coverage.openConflicts.map((conflict) => ({
        conflictId: conflict.id,
        ticketId: conflict.ticketId,
        materialId: coverage.material.id,
        fingerprint: coverage.material.fingerprint,
        lateSupplier: conflict.supplierId,
        conflictSource: conflict.conflictingBy,
        sourceSupplier: conflict.conflictingSupplierId,
        sourceClauses: conflict.conflictingClauseIds.join(";"),
        attemptedClauses: conflict.attemptedClauseIds.join(";"),
        attemptedNote: conflict.attemptedNote,
      })),
    ),
  );
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });
  readonly keyword = signal("");
  readonly action = signal("all");
  readonly actionOptions = computed(() => [
    { label: "全部动作", value: "all" },
    ...Array.from(new Set(this.logs().map((log) => log.action))).map(
      (item) => ({ label: item, value: item }),
    ),
  ]);
  readonly filteredLogs = computed(() => {
    const keyword = this.keyword().trim().toLowerCase();
    const action = this.action();
    return this.logs().filter((log) => {
      const matchesAction = action === "all" || log.action === action;
      const matchesKeyword =
        !keyword ||
        [log.actor, log.action, log.entity, log.detail]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      return matchesAction && matchesKeyword;
    });
  });
  readonly finalVersion = computed(
    () => this.versions().find((version) => version.status === "finalized"),
  );
  readonly finalizedCount = computed(
    () => this.versions().filter((version) => version.status === "finalized").length,
  );

  exportJson(): void {
    this.download(
      "procurement-review-audit.json",
      JSON.stringify(this.filteredLogs(), null, 2),
      "application/json;charset=utf-8",
    );
  }

  exportCsv(): void {
    const header = ["时间", "操作人", "动作", "对象", "详情"];
    const rows = this.filteredLogs().map((log) => [
      log.at,
      log.actor,
      log.action,
      log.entity,
      log.detail,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    this.download(
      "procurement-review-audit.csv",
      csv,
      "text/csv;charset=utf-8",
    );
  }

  exportScopeCsv(): void {
    const header = [
      "材料编号",
      "指纹",
      "附件",
      "修订号",
      "核验单",
      "确认人",
      "覆盖供应商",
      "覆盖条款",
      "待重评数量",
      "冲突数量",
      "确认时间",
      "适用范围说明",
    ];
    const rows = this.coverageExportRows().map((row) => [
      row.materialId,
      row.fingerprint,
      row.attachmentName,
      String(row.revision),
      row.ticketId,
      row.confirmedBy,
      row.supplierName,
      row.clauseIds,
      String(row.pendingReReview),
      String(row.conflictCount),
      row.confirmedAt,
      row.note,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    this.download(
      "proof-material-scope.csv",
      csv,
      "text/csv;charset=utf-8",
    );
  }

  exportReReviewCsv(): void {
    const header = [
      "响应编号",
      "条款编号",
      "条款名称",
      "供应商",
      "新附件",
      "新指纹",
      "评审轮次",
    ];
    const rows = this.pendingReReviewExportRows().map((row) => [
      row.responseId,
      row.clauseCode,
      row.clauseTitle,
      row.supplierName,
      row.attachmentName,
      row.fingerprint,
      String(row.reviewRound),
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    this.download("proof-pending-rereview.csv", csv, "text/csv;charset=utf-8");
  }

  exportConflictCsv(): void {
    const header = [
      "冲突编号",
      "核验单",
      "材料编号",
      "指纹",
      "后到供应商",
      "冲突来源",
      "来源供应商",
      "来源覆盖条款",
      "后到勾选条款",
      "后到填写说明",
    ];
    const rows = this.conflictExportRows().map((row) => [
      row.conflictId,
      row.ticketId,
      row.materialId,
      row.fingerprint,
      row.lateSupplier,
      row.conflictSource,
      row.sourceSupplier,
      row.sourceClauses,
      row.attemptedClauses,
      row.attemptedNote,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    this.download("proof-scope-conflicts.csv", csv, "text/csv;charset=utf-8");
  }

  resetReviewData(): void {
    this.store.dispatch(ReviewActions.resetReviewData());
  }

  private download(filename: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
