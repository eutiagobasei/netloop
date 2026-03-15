import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DEFAULT_PROMPTS } from '../ai/constants/default-prompts';

@ApiTags('Prompts')
@Controller('prompts')
export class PromptsController {
  @Get('defaults')
  @ApiOperation({ summary: 'Retorna os prompts padrão do sistema' })
  @ApiResponse({ status: 200, description: 'Prompts padrão' })
  async getDefaultPrompts() {
    return DEFAULT_PROMPTS;
  }
}
