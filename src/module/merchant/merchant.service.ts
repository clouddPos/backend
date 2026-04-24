import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateMerchantDto, UpdateMerchantDto } from './dto';

@Injectable()
export class MerchantService {
  private readonly logger = new Logger(MerchantService.name);

  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateMerchantDto) {
    const existing = await this.db.merchant.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Merchant with this email already exists');
    }

    const merchant = await this.db.merchant.create({
      data: {
        businessName: dto.businessName,
        email: dto.email,
        phone: dto.phone,
        stripeAccountId: dto.stripeAccountId,
        nowpaymentsApiToken: dto.nowpaymentsApiToken,
      },
    });

    this.logger.log(
      `Merchant created: ${merchant.id} - ${merchant.businessName}`,
    );
    return merchant;
  }

  async findById(id: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    return merchant;
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, status, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [merchants, total] = await Promise.all([
      this.db.merchant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { transactions: true },
          },
        },
      }),
      this.db.merchant.count({ where }),
    ]);

    return {
      data: merchants,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, dto: UpdateMerchantDto) {
    await this.findById(id); // throws if not found

    const merchant = await this.db.merchant.update({
      where: { id },
      data: dto,
    });

    this.logger.log(`Merchant updated: ${merchant.id}`);
    return merchant;
  }
}
