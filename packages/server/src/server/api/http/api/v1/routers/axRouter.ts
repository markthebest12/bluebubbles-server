import { Next } from "koa";
import { RouterContext } from "koa-router";
import { Server } from "@server";
import { Success } from "../responses/success";
import { ServerError } from "../responses/errors";

function requireAxService() {
    const service = Server().axService;
    if (!service) {
        throw new ServerError({ error: "ax-helper service not available" });
    }
    return service;
}

export class AxRouter {
    static async tapback(ctx: RouterContext, _: Next) {
        const { type, traceId } = ctx.request.body as any;
        const service = requireAxService();
        try {
            const result = await service.tapback(type, traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "tapback failed" });
        }
    }

    static async markRead(ctx: RouterContext, _: Next) {
        const { traceId } = ctx.request.body as any;
        const service = requireAxService();
        try {
            const result = await service.markRead(traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "mark-read failed" });
        }
    }

    static async navigate(ctx: RouterContext, _: Next) {
        const { direction, traceId } = ctx.request.body as any;
        const service = requireAxService();
        try {
            const result = await service.navigate(direction, traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "navigate failed" });
        }
    }

    static async check(ctx: RouterContext, _: Next) {
        const { traceId } = ctx.query as any;
        const service = requireAxService();
        try {
            const result = await service.check(traceId);
            return new Success(ctx, { data: result }).send();
        } catch (ex: any) {
            throw new ServerError({ error: ex?.message ?? "check failed" });
        }
    }
}
