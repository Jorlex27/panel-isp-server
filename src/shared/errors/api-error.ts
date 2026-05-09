import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { MongoServerError } from 'mongodb';
import { ZodError } from 'zod';
import { isDev } from '@config/index';

export class ApiError extends Error {
    statusCode: number;
    errorCode?: string;
    validationErrors?: { field: string; message: string }[];

    constructor(
        message: string,
        statusCode: number = 500,
        errorCode?: string,
        validationErrors?: { field: string; message: string }[]
    ) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.validationErrors = validationErrors;
    }

    static handle(error: unknown, c: Context, entityName: string): Response {
        if (error instanceof ApiError) {
            const body: Record<string, unknown> = {
                success: false,
                message: error.message,
                errorCode: error.errorCode,
            };
            if (error.validationErrors) body.errors = error.validationErrors;
            if (isDev && error.stack) body.stack = error.stack;
            return c.json(body, error.statusCode as ContentfulStatusCode);
        }
        if (error instanceof ZodError) {
            const validationErrors = error.issues.map(issue => ({
                field: issue.path.join('.') || 'root',
                message: issue.message,
            }));
            return c.json(
                {
                    success: false,
                    message: 'Data tidak valid',
                    errorCode: 'VALIDATION_ERROR',
                    errors: validationErrors,
                },
                400
            );
        }
        if (error instanceof MongoServerError && error.code === 11000) {
            return c.json(
                { success: false, message: 'Data duplikat', errorCode: 'DUPLICATE_ENTRY' },
                409
            );
        }
        const stack = error instanceof Error ? error.stack : undefined;
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`${entityName} error:`, msg, stack);
        const body: Record<string, unknown> = {
            success: false,
            message: 'Terjadi kesalahan',
            errorCode: 'INTERNAL_ERROR',
        };
        if (isDev && stack) body.stack = stack;
        return c.json(body, 500);
    }

    static notFound(message: string): ApiError {
        return new ApiError(message, 404, 'NOT_FOUND');
    }

    static badRequest(message: string, errorCode: string = 'BAD_REQUEST'): ApiError {
        return new ApiError(message, 400, errorCode);
    }
}
