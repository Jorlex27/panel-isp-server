import { logger } from '@shared/utils/logger.util';

export async function kirimWA(noHp: string, pesan: string): Promise<void> {
    logger.info(`WA stub → ${noHp}`, pesan);
}
