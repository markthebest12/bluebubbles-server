import { Next } from "koa";
import { RouterContext } from "koa-router";
import { Server } from "@server";
import { Success } from "../responses/success";
import { ServerError } from "../responses/errors";

export class AxRouter {
    static async tapback(ctx: RouterContext, _: Next) {
        const { type, traceId } = ctx.request.body as any;
        try {
            const result = await Server().axService.tapback(type, traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "tapback failed" });
        }
    }

    static async markRead(ctx: RouterContext, _: Next) {
        const { traceId } = ctx.request.body as any;
        try {
            const result = await Server().axService.markRead(traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "mark-read failed" });
        }
    }

    static async navigate(ctx: RouterContext, _: Next) {
        const { direction, traceId } = ctx.request.body as any;
        try {
            const result = await Server().axService.navigate(direction, traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "navigate failed" });
        }
    }

    static async check(ctx: RouterContext, _: Next) {
        const { traceId } = ctx.query as any;
        try {
            const result = await Server().axService.check(traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "check failed" });
        }
    }
}
