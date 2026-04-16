import { Next } from "koa";
import { RouterContext } from "koa-router";
import { BadRequest } from "../responses/errors";

const VALID_TAPBACK_TYPES = ["heart", "thumbsup", "thumbsdown", "haha", "emphasis", "question"];
const VALID_DIRECTIONS = ["next", "prev"];

export class AxValidator {
    static async validateTapback(ctx: RouterContext, next: Next) {
        const { type } = (ctx.request.body ?? {}) as any;
        if (!type || !VALID_TAPBACK_TYPES.includes(type)) {
            throw new BadRequest({
                error: `Invalid tapback type. Valid: ${VALID_TAPBACK_TYPES.join(", ")}`
            });
        }
        await next();
    }

    static async validateNavigate(ctx: RouterContext, next: Next) {
        const { direction } = (ctx.request.body ?? {}) as any;
        if (!direction || !VALID_DIRECTIONS.includes(direction)) {
            throw new BadRequest({
                error: "Invalid direction. Valid: next, prev"
            });
        }
        await next();
    }
}
