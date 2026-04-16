import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { StripeService } from '../payment/stripe.service';

/**
 * Currency information returned by the API
 */
interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  minimumAmount: number;
  decimalPlaces: number;
  supported: boolean;
}

@ApiTags('Currencies')
@Controller('currencies')
export class CurrencyController {
  constructor(private readonly stripeService: StripeService) {}

  @Get()
  @ApiOperation({
    summary: 'Get supported currencies',
    description: `
Returns a list of currencies supported by Stripe for payment processing.

**Features:**
- Search by currency code or name
- Filter by zero-decimal currencies
- Includes minimum amounts and symbols

**Common Currencies:**
- USD (US Dollar) - Min: $0.50
- EUR (Euro) - Min: €0.50
- GBP (British Pound) - Min: £0.30
- NGN (Nigerian Naira) - Min: ₦50
- JPY (Japanese Yen) - Min: ¥50 (zero-decimal)
`,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'usd',
    description: 'Search by currency code or name (case-insensitive)',
  })
  @ApiQuery({
    name: 'zeroDecimal',
    required: false,
    example: 'false',
    description:
      'Filter for zero-decimal currencies (e.g., JPY, KRW). Use "true" or "false"',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported currencies',
    schema: {
      example: {
        currencies: [
          {
            code: 'USD',
            name: 'United States Dollar',
            symbol: '$',
            minimumAmount: 0.5,
            decimalPlaces: 2,
            supported: true,
          },
          {
            code: 'NGN',
            name: 'Nigerian Naira',
            symbol: '₦',
            minimumAmount: 50,
            decimalPlaces: 2,
            supported: true,
          },
          {
            code: 'JPY',
            name: 'Japanese Yen',
            symbol: '¥',
            minimumAmount: 50,
            decimalPlaces: 0,
            supported: true,
          },
        ],
        total: 135,
        search: 'usd',
      },
    },
  })
  async getCurrencies(
    @Query('search') search?: string,
    @Query('zeroDecimal') zeroDecimal?: string,
  ) {
    const currencies = await this.stripeService.getSupportedCurrencies();

    let filtered = currencies;

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.code.toLowerCase().includes(searchLower) ||
          c.name.toLowerCase().includes(searchLower),
      );
    }

    // Apply zero-decimal filter
    if (zeroDecimal !== undefined) {
      const isZeroDecimal = zeroDecimal.toLowerCase() === 'true';
      filtered = filtered.filter(
        (c) => (c.decimalPlaces === 0) === isZeroDecimal,
      );
    }

    return {
      currencies: filtered,
      total: filtered.length,
      search: search || null,
    };
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Get currency details',
    description:
      'Get detailed information about a specific currency by its ISO code',
  })
  @ApiQuery({
    name: 'code',
    required: true,
    example: 'NGN',
    description: 'ISO currency code (e.g., NGN, USD, EUR)',
  })
  @ApiResponse({
    status: 200,
    description: 'Currency details',
    schema: {
      example: {
        code: 'NGN',
        name: 'Nigerian Naira',
        symbol: '₦',
        minimumAmount: 50,
        decimalPlaces: 2,
        supported: true,
        countries: ['NG'],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Currency not found',
    schema: {
      example: {
        statusCode: 404,
        message: "Currency 'XXX' not found or not supported by Stripe",
        error: 'Not Found',
      },
    },
  })
  async getCurrencyByCode(@Query('code') code: string) {
    const currencies = await this.stripeService.getSupportedCurrencies();
    const currency = currencies.find(
      (c) => c.code.toLowerCase() === code.toLowerCase(),
    );

    if (!currency) {
      return {
        statusCode: 404,
        message: `Currency '${code}' not found or not supported by Stripe`,
        error: 'Not Found',
      };
    }

    return currency;
  }
}
