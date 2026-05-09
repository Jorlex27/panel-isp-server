import type { ObjectId } from 'mongodb';

export interface PembayaranItem {
    tanggal: Date;
    jumlah: number;
    metode: string;
}

export interface PaketDoc {
    _id: ObjectId;
    nama: string;
    hargaBulanan: number;
    speedDown: number;
    speedUp: number;
    deskripsi?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface PelangganDoc {
    _id: ObjectId;
    nama: string;
    noHp: string;
    alamat: string;
    macAddress: string;
    ipAddress: string;
    status: 'aktif' | 'suspend';
    createdAt?: Date;
    updatedAt?: Date;
}

export interface LanggananDoc {
    _id: ObjectId;
    pelangganId: ObjectId;
    paketId: ObjectId;
    tanggalMulai: Date;
    tanggalExpire: Date;
    statusBayar: 'lunas' | 'belum_bayar';
    historyPembayaran: PembayaranItem[];
    createdAt?: Date;
    updatedAt?: Date;
}

export interface LanggananPopulated extends LanggananDoc {
    pelanggan: PelangganDoc | null;
    paket: PaketDoc | null;
}

export interface PelangganPopulated extends PelangganDoc {
    langganan: LanggananDoc | null;
    paket: PaketDoc | null;
}

export interface PaketPopulated extends PaketDoc {
    langganans: LanggananDoc[];
}
