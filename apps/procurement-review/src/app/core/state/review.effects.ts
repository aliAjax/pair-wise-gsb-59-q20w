import { Injectable, inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { catchError, map, of, switchMap } from "rxjs";
import { roleProfiles } from "../models/review.models";
import { ReviewGraphqlService } from "../services/graphql.service";
import { ReviewActions } from "./review.actions";

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "GraphQL 请求失败，请检查本地 mock server。";
};

const reloadWorkspace = (
  graphql: ReviewGraphqlService,
  toast: string,
) =>
  graphql.loadWorkspace().pipe(
    map(({ workspace }) =>
      ReviewActions.loadReviewDataSuccess({ workspace, toast }),
    ),
    catchError((error: unknown) =>
      of(
        ReviewActions.loadReviewDataFailure({
          error: errorMessage(error),
        }),
      ),
    ),
  );

@Injectable()
export class ReviewEffects {
  private readonly actions$ = inject(Actions);
  private readonly graphql = inject(ReviewGraphqlService);

  loadReviewData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.loadReviewData),
      switchMap(() =>
        this.graphql.loadWorkspace().pipe(
          map(({ workspace }) =>
            ReviewActions.loadReviewDataSuccess({ workspace }),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  submitAssessment$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.submitAssessment),
      switchMap(({ input }) =>
        this.graphql.submitAssessment(input).pipe(
          switchMap(() =>
            reloadWorkspace(
              this.graphql,
              "评审意见已提交，其他评审员意见保持不变。",
            ),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  requestClarification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.requestClarification),
      switchMap(({ input }) =>
        this.graphql.requestClarification(input).pipe(
          switchMap(() =>
            reloadWorkspace(this.graphql, "澄清要求已发出，并写入审计日志。"),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  respondClarification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.respondClarification),
      switchMap(({ input }) =>
        this.graphql.respondClarification(input).pipe(
          switchMap(() =>
            reloadWorkspace(
              this.graphql,
              "澄清回复已登记，等待评审员复核。",
            ),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  finalizeVersion$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.finalizeVersion),
      switchMap(({ input }) =>
        this.graphql.finalizeVersion(input).pipe(
          switchMap(() =>
            reloadWorkspace(this.graphql, "评审版本已汇总签字并锁定。"),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  confirmScope$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.confirmScope),
      switchMap(({ input }) =>
        this.graphql.confirmScope(input).pipe(
          switchMap((result) => {
            if (result.conflict) {
              return this.graphql.loadWorkspace().pipe(
                map(({ workspace }) =>
                  ReviewActions.loadReviewDataSuccess({
                    workspace,
                    toast:
                      "材料适用范围存在冲突：已保留你的填写内容，请核对冲突来源后沿用原核验单重试。",
                  }),
                ),
              );
            }
            return reloadWorkspace(
              this.graphql,
              result.reusedTicket
                ? "已沿用原核验单重试成功，未产生重复记录，响应已进入评审。"
                : "适用范围核验通过，响应已进入评审。",
            );
          }),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  updateProofMaterial$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.updateProofMaterial),
      switchMap(({ input }) =>
        this.graphql.updateProofMaterial(input).pipe(
          switchMap(() =>
            reloadWorkspace(
              this.graphql,
              "材料已更新：未定稿核验单与意见失效并转入待重评，盖章版本保留原材料。",
            ),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  resolveScopeConflict$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.resolveScopeConflict),
      switchMap(({ conflict }) =>
        this.graphql
          .resolveScopeConflict(conflict.id, roleProfiles.procurement.name)
          .pipe(
            switchMap(() =>
              reloadWorkspace(
                this.graphql,
                "冲突已标记处理，后到一方可沿用原核验单重新确认。",
              ),
            ),
            catchError((error: unknown) =>
              of(
                ReviewActions.loadReviewDataFailure({
                  error: errorMessage(error),
                }),
              ),
            ),
          ),
      ),
    ),
  );

  resetReviewData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReviewActions.resetReviewData),
      switchMap(() =>
        this.graphql.resetReviewData().pipe(
          switchMap(() =>
            reloadWorkspace(this.graphql, "评审演示数据已恢复。"),
          ),
          catchError((error: unknown) =>
            of(
              ReviewActions.loadReviewDataFailure({
                error: errorMessage(error),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
