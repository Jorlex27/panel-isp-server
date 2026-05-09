import { db } from '@shared/utils/db.util';

export interface DashboardSummary {
    totalPelanggan: number;
    aktif: number;
    suspend: number;
    revenueBulanIni: number;
    akanExpire3Hari: number;
}

export async function getSummary(): Promise<DashboardSummary> {
    const pelCol = db.getCollection('pelanggan');
    const langCol = db.getCollection('langganan');

    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const now = new Date();
    const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [totalPelanggan, aktif, suspend, revenueAgg, akanExpire3Hari] = await Promise.all([
        pelCol.countDocuments(),
        pelCol.countDocuments({ status: 'aktif' }),
        pelCol.countDocuments({ status: 'suspend' }),
        langCol
            .aggregate<{ total: number }>([
                { $unwind: '$historyPembayaran' },
                {
                    $match: {
                        'historyPembayaran.tanggal': { $gte: firstDayOfMonth },
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$historyPembayaran.jumlah' },
                    },
                },
            ])
            .toArray(),
        langCol.countDocuments({
            tanggalExpire: { $gte: now, $lte: threeDaysLater },
        }),
    ]);

    return {
        totalPelanggan,
        aktif,
        suspend,
        revenueBulanIni: revenueAgg[0]?.total ?? 0,
        akanExpire3Hari,
    };
}
