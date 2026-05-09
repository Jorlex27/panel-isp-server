import { isDev } from '@config/index';

function fmt(prefix: string, message: string): string {
    return `[${prefix}] ${message}`;
}

export const logger = {
    info: (message: string, ...rest: unknown[]) => {
        if (isDev) console.log(fmt('info', message), ...rest);
    },
    warn: (message: string, ...rest: unknown[]) => console.warn(fmt('warn', message), ...rest),
    error: (message: string, ...rest: unknown[]) => console.error(fmt('error', message), ...rest),
    db: (message: string) => console.log(fmt('db', message)),
    server: (message: string) => console.log(fmt('server', message)),
};
