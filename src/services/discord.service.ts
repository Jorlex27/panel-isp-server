import { logger } from '@shared/utils/logger.util';

export async function kirimDiscord(
    pesan: string,
    title: string = 'Panel ISP Notifikasi',
    color: number = 0x5865f2
): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{ title, description: pesan, color }],
        }),
    });
}

export function kirimDiscordSafe(pesan: string, title: string, color: number = 0x5865f2): void {
    void kirimDiscord(pesan, title, color).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`Discord webhook gagal: ${msg}`);
    });
}
