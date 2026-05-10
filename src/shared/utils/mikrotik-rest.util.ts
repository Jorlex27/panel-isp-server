export type RosRow = Record<string, string>;

export class MikrotikRestClient {
    private readonly host: string;
    private readonly baseUrl: string;
    private readonly authHeader: string;
    private readonly tls: { rejectUnauthorized: boolean } | undefined;

    constructor() {
        this.host = (process.env.MIKROTIK_HOST ?? '').trim();
        const schemeRaw = (process.env.MIKROTIK_REST_SCHEME ?? 'http').toLowerCase();
        const scheme = schemeRaw === 'http' ? 'http' : 'https';
        const portEnv = process.env.MIKROTIK_REST_PORT;
        const port =
            portEnv !== undefined && portEnv !== '' ? Number(portEnv) : scheme === 'https' ? 443 : 80;
        const user = process.env.MIKROTIK_USER ?? '';
        const pass = process.env.MIKROTIK_PASS ?? '';
        this.baseUrl = `${scheme}://${this.host}:${port}/rest`;
        this.authHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
        const tlsRaw = process.env.MIKROTIK_REST_TLS_INSECURE?.toLowerCase();
        const allowInsecureCert = tlsRaw !== 'false' && tlsRaw !== '0';
        this.tls = scheme === 'https' ? { rejectUnauthorized: !allowInsecureCert } : undefined;
    }

    private async request(path: string, init: RequestInit): Promise<Response> {
        if (!this.host) {
            throw new Error(
                'MIKROTIK_HOST kosong. Set IP/router di .env (REST lewat layanan www port 80 atau www-ssl port 443).'
            );
        }
        const url = `${this.baseUrl}/${path.replace(/^\//, '')}`;
        const headers = new Headers(init.headers);
        headers.set('Authorization', this.authHeader);
        if (init.body !== undefined && init.body !== null && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
        try {
            return await fetch(url, {
                ...init,
                headers,
                tls: this.tls,
            });
        } catch (e) {
            const hint =
                ' Periksa .env: MIKROTIK_REST_SCHEME=http + MIKROTIK_REST_PORT=80 jika www-ssl mati; host harus reachable dari mesin ini.';
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`MikroTik REST tidak terjangkau (${this.baseUrl}): ${msg}.${hint}`);
        }
    }

    async ping(): Promise<void> {
        const res = await this.request('system/resource', { method: 'GET' });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`MikroTik REST: ${res.status} ${t}`);
        }
    }

    async getJson(menu: string): Promise<unknown> {
        const res = await this.request(menu, { method: 'GET' });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`MikroTik REST GET ${menu}: ${res.status} ${t}`);
        }
        return res.json();
    }

    async postAction(path: string, body: Record<string, unknown>): Promise<unknown> {
        const res = await this.request(path, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`MikroTik REST POST ${path}: ${res.status} ${t}`);
        }
        const txt = await res.text();
        if (!txt) return null;
        return JSON.parse(txt) as unknown;
    }

    async print(menu: string, query: Record<string, string> = {}): Promise<RosRow[]> {
        const q = new URLSearchParams(query);
        const path = q.toString() ? `${menu}?${q}` : menu;
        const res = await this.request(path, { method: 'GET' });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`MikroTik REST GET ${menu}: ${res.status} ${t}`);
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return [];
        return data as RosRow[];
    }

    async add(menu: string, body: Record<string, string>): Promise<RosRow> {
        const res = await this.request(menu, { method: 'PUT', body: JSON.stringify(body) });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`MikroTik REST PUT ${menu}: ${res.status} ${t}`);
        }
        return (await res.json()) as RosRow;
    }

    async set(menu: string, id: string, body: Record<string, string>): Promise<RosRow> {
        const enc = encodeURIComponent(id);
        const res = await this.request(`${menu}/${enc}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`MikroTik REST PATCH ${menu}/${id}: ${res.status} ${t}`);
        }
        return (await res.json()) as RosRow;
    }

    async remove(menu: string, id: string): Promise<void> {
        const enc = encodeURIComponent(id);
        const res = await this.request(`${menu}/${enc}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            const t = await res.text();
            throw new Error(`MikroTik REST DELETE ${menu}/${id}: ${res.status} ${t}`);
        }
    }
}

export function createMikrotikClient(): MikrotikRestClient {
    return new MikrotikRestClient();
}
