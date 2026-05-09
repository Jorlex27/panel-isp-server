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
