import { PrismaClient, UserRole, TagType, ConnectionStrength, SettingCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Settings padrão para convites de contatos
const CONTACT_INVITE_SETTINGS = {
  contact_invite_enabled: {
    key: 'contact_invite_enabled',
    value: 'true',
    category: 'SYSTEM' as const,
    description: 'Habilitar notificações de convite para contatos',
  },
  contact_invite_message: {
    key: 'contact_invite_message',
    value: `🤝 *{inviterName}* acabou de adicionar você à rede de networking dele no Netloop!

O Netloop é uma plataforma que ajuda profissionais a gerenciar suas conexões de forma inteligente.

Por enquanto o acesso é *gratuito*! Responda qualquer mensagem para começar seu cadastro.`,
    category: 'PROMPTS' as const,
    description: 'Template da mensagem de convite. Variáveis: {inviterName}, {contactName}, {inviteCount}',
  },
  contact_invite_delay_ms: {
    key: 'contact_invite_delay_ms',
    value: '5000',
    category: 'SYSTEM' as const,
    description: 'Delay em ms antes de enviar notificação (evita spam)',
  },
};

// Prompts padrão para IA
const DEFAULT_PROMPTS = {
  prompt_intent_classification: {
    key: 'prompt_intent_classification',
    description: 'Classificação de intenção da mensagem (query/contact_info/update_contact/other)',
    value: `Classifique a intenção da mensagem:
- "query": usuário quer BUSCAR informação sobre alguém (ex: "quem é João?", "o que sabe sobre Maria?", "me fala do Pedro", "conhece algum advogado?")
- "contact_info": usuário está INFORMANDO dados de um contato para cadastrar. DEVE conter informações substanciais como: nome + empresa, nome + cargo, nome + contexto de como conheceu, etc. NÃO classifique como contact_info se for apenas um nome solto ou saudação.
- "update_contact": usuário quer ATUALIZAR dados de um contato existente (ex: "atualizar dados de João", "editar informações do Pedro", "corrigir o email da Maria")
- "other": saudação (oi, olá, bom dia), agradecimento, confirmação (ok, sim), ou mensagem sem informação de contato útil

IMPORTANTE: Mensagens como "Olá", "Opa", "Oi tudo bem?", "Bom dia", apenas um nome sem contexto, ou saudações em geral são SEMPRE "other".

Responda APENAS com: query, contact_info, update_contact ou other`,
  },

  prompt_query_subject: {
    key: 'prompt_query_subject',
    description: 'Extração do assunto/nome da busca',
    value: `Extraia o NOME da pessoa ou o ASSUNTO que o usuário está buscando.
Exemplos:
- "quem é o João?" → "João"
- "o que você sabe sobre Maria Silva?" → "Maria Silva"
- "me fala do Pedro" → "Pedro"
- "conhece algum advogado?" → "advogado"
- "tem alguém de marketing?" → "marketing"

Responda APENAS com o nome ou termo de busca, sem pontuação ou explicações. Se não conseguir identificar, responda "null".`,
  },

  prompt_contact_extraction: {
    key: 'prompt_contact_extraction',
    description: 'Extração de dados de contato do texto',
    value: `Você é um assistente especializado em extrair informações de contatos profissionais de textos em português.

Analise o texto fornecido e extraia as seguintes informações (se disponíveis):
- name: Nome completo da pessoa (IMPORTANTE: incluir nome E sobrenome exatamente como mencionado. Ex: "João Silva", "Maria Santos", não apenas "João")
- company: Nome da empresa onde trabalha
- position: Cargo ou função
- phone: Número de telefone (formato brasileiro) - CAMPO OBRIGATÓRIO para salvar contato
- email: Endereço de email
- location: Cidade, estado ou país
- context: Um resumo de como/onde se conheceram ou o contexto do encontro
- tags: Lista de PONTOS DE CONEXÃO - inclua:
  * Lugares, eventos, grupos ou comunidades onde se conheceram (ex: "Em Adoração", "SIPAT 2024", "Igreja São Paulo")
  * Interesses e áreas de atuação profissional (ex: "investidor", "tecnologia", "podcast")

IMPORTANTE:
- O campo PHONE é OBRIGATÓRIO para salvar um contato - se não estiver no texto, retorne phone como null mas avise no contexto
- Normalize o telefone para apenas números se possível (ex: 5521987654321)
- Se uma informação não estiver clara no texto, não invente. Deixe o campo vazio ou null.
- O campo "context" deve ser um resumo útil do encontro/conversa.
- Tags devem priorizar ONDE/COMO se conheceram (pontos de conexão), seguido de interesses.
- Capture o nome EXATAMENTE como mencionado, incluindo sobrenome.

Retorne APENAS um JSON válido com os campos acima. Não inclua explicações.`,
  },

  prompt_registration_response: {
    key: 'prompt_registration_response',
    description: 'Resposta conversacional para registro de usuário',
    value: `Você é o assistente do NetLoop, uma plataforma de networking que ajuda pessoas a organizar seus contatos profissionais.
Um novo usuário está se cadastrando via WhatsApp.

DADOS JÁ COLETADOS:
- Nome: {{name}}
- Telefone confirmado: {{phoneConfirmed}}
- Telefone detectado: {{phoneFormatted}}
- Email: {{email}}

REGRAS IMPORTANTES:
1. Seja conversacional e amigável, NUNCA robótico ou formal demais
2. Use linguagem natural e descontraída (pode usar "você", "a gente", etc)
3. Respostas curtas e diretas (máximo 2-3 frases)
4. Se for a primeira mensagem (saudação), apresente-se brevemente e pergunte o nome
5. APÓS ter o nome, peça confirmação do telefone mostrando o número formatado
6. Se usuário confirmar o telefone (sim, correto, isso, exato, etc), marque phoneConfirmed: true
7. Se usuário negar (não, errado, etc), peça para digitar o número correto
8. Só peça email DEPOIS de ter nome E telefone confirmado
9. Quando tiver TODOS (nome + telefone confirmado + email válido), confirme o cadastro com entusiasmo
10. Email deve ter formato válido (algo@algo.algo)
11. NÃO invente dados - só extraia o que o usuário realmente disse

FLUXO DE ESTADOS:
1. [Primeira mensagem] → Se apresentar e pedir nome
2. [TEM NOME] → Mostrar telefone detectado e pedir confirmação
3. [TELEFONE CONFIRMADO] → Pedir email
4. [COMPLETED] → Nome + Telefone + Email coletados

EXEMPLOS DE TOM:
- "Oi! Prazer, sou o assistente do NetLoop 👋 Como posso te chamar?"
- "Show, {{name}}! Detectei que seu número é {{phoneFormatted}}. Tá certo?"
- "Perfeito! Me passa seu email pra finalizar o cadastro?"
- "Pronto! Cadastro concluído! Agora é só me mandar áudios ou textos sobre pessoas que conheceu 🚀"

RESPONDA APENAS EM JSON VÁLIDO:
{
  "response": "Sua mensagem de resposta",
  "extracted": {
    "name": "nome extraído ou null se não encontrou",
    "email": "email extraído ou null se não encontrou",
    "phoneConfirmed": true/false
  },
  "isComplete": false
}

IMPORTANTE: isComplete só deve ser true quando TODOS (nome + telefone confirmado + email válido) estiverem coletados.`,
  },

  prompt_greeting_response: {
    key: 'prompt_greeting_response',
    description: 'Resposta para saudações',
    value: `Você é um assistente virtual amigável do NetLoop, um sistema de gerenciamento de contatos via WhatsApp.

Gere uma resposta curta e simpática para uma saudação do usuário.

FUNCIONALIDADES DO SISTEMA:
- Salvar contatos: usuário envia nome, telefone, email, etc.
- Buscar contatos: usuário pergunta "quem é João?" ou "me passa o contato do Carlos"
- Atualizar contatos existentes

REGRAS:
- Seja breve (máximo 3 linhas)
- Use tom amigável e profissional
- Mencione brevemente o que o sistema pode fazer
- {{userName}}
- Pode usar 1 emoji no máximo`,
  },
};

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Cria usuário super admin (produção)
  const superAdminPassword = await bcrypt.hash('DngEEOO7LT7AhVCnsH1i', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'supa@hprod.io' },
    update: {},
    create: {
      email: 'supa@hprod.io',
      password: superAdminPassword,
      name: 'Super Admin',
      phone: '+5500000000000',
      role: UserRole.ADMIN,
    },
  });
  console.log('✅ Super Admin criado:', superAdmin.email);

  // Cria usuário admin legacy (desenvolvimento)
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@netloop.com' },
    update: {},
    create: {
      email: 'admin@netloop.com',
      password: adminPassword,
      name: 'Administrador',
      phone: '+5511999999999',
      role: UserRole.ADMIN,
    },
  });
  console.log('✅ Admin dev criado:', admin.email);

  // Cria usuário de teste
  const userPassword = await bcrypt.hash('user123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'teste@netloop.com' },
    update: {},
    create: {
      email: 'teste@netloop.com',
      password: userPassword,
      name: 'Usuário Teste',
      phone: '+5511988888888',
      role: UserRole.USER,
    },
  });
  console.log('✅ Usuário de teste criado:', user.email);

  // Cria clube SOMA
  const club = await prisma.club.upsert({
    where: { slug: 'soma' },
    update: {},
    create: {
      name: 'SOMA',
      slug: 'soma',
      description: 'Comunidade de empreendedores',
      isVerified: true,
    },
  });
  console.log('✅ Clube criado:', club.name);

  // Cria admin do clube SOMA
  const clubAdminPassword = await bcrypt.hash('soma123', 12);
  const clubAdmin = await prisma.clubAdmin.upsert({
    where: { clubId_email: { clubId: club.id, email: 'admin@soma.club' } },
    update: {},
    create: {
      clubId: club.id,
      email: 'admin@soma.club',
      password: clubAdminPassword,
      name: 'Admin SOMA',
    },
  });
  console.log('✅ Club Admin criado:', clubAdmin.email);

  // Adiciona usuário ao clube
  await prisma.clubMember.upsert({
    where: {
      userId_clubId: {
        userId: user.id,
        clubId: club.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      clubId: club.id,
      isAdmin: false,
    },
  });
  console.log('✅ Usuário adicionado ao clube SOMA');

  // Cria tags livres (usando findFirst + create para evitar problemas com null no unique)
  const tagsData = [
    { name: 'Tecnologia', color: '#6366f1' },
    { name: 'Marketing', color: '#ec4899' },
    { name: 'Vendas', color: '#10b981' },
    { name: 'Investidor', color: '#f59e0b' },
    { name: 'Mentor', color: '#8b5cf6' },
  ];

  for (const tagData of tagsData) {
    const slug = tagData.name.toLowerCase();
    const existingTag = await prisma.tag.findFirst({
      where: {
        slug,
        clubId: null,
      },
    });

    if (!existingTag) {
      await prisma.tag.create({
        data: {
          name: tagData.name,
          slug,
          color: tagData.color,
          type: TagType.FREE,
          createdById: user.id,
        },
      });
    }
  }
  console.log('✅ Tags livres criadas');

  // Cria tag institucional para o clube SOMA
  const existingInstitutionalTag = await prisma.tag.findFirst({
    where: {
      slug: 'membro-soma',
      clubId: club.id,
    },
  });

  if (!existingInstitutionalTag) {
    await prisma.tag.create({
      data: {
        name: 'Membro SOMA',
        slug: 'membro-soma',
        color: '#ef4444',
        type: TagType.INSTITUTIONAL,
        clubId: club.id,
        createdById: admin.id,
      },
    });
  }
  console.log('✅ Tag institucional criada');

  // Cria contatos de exemplo
  const contacts = [
    {
      name: 'Maria Santos',
      phone: '+5511977777777',
      email: 'maria@techcorp.com',
      company: 'TechCorp',
      position: 'CTO',
      location: 'São Paulo, SP',
      notes: 'Especialista em cloud computing e arquitetura de sistemas',
      context: 'Conheci no evento TechDay 2024',
    },
    {
      name: 'João Oliveira',
      phone: '+5511966666666',
      email: 'joao@startup.io',
      company: 'Startup.io',
      position: 'CEO',
      location: 'Rio de Janeiro, RJ',
      notes: 'Empreendedor serial, já fundou 3 startups',
      context: 'Indicação do Pedro, se conheceram no SOMA',
    },
    {
      name: 'Ana Costa',
      phone: '+5511955555555',
      email: 'ana@marketing.pro',
      company: 'Marketing Pro',
      position: 'Diretora de Marketing',
      location: 'Belo Horizonte, MG',
      notes: 'Especialista em growth hacking e marketing digital',
      context: 'Palestrante no evento de marketing da SOMA',
    },
  ];

  // Verifica se já existem contatos
  const existingContacts = await prisma.contact.count({ where: { ownerId: user.id } });

  if (existingContacts === 0) {
    for (const contactData of contacts) {
      const contact = await prisma.contact.create({
        data: {
          ...contactData,
          ownerId: user.id,
        },
      });

      // Cria conexão
      await prisma.connection.create({
        data: {
          fromUserId: user.id,
          contactId: contact.id,
          strength: ConnectionStrength.MODERATE,
          context: contactData.context,
        },
      });
    }
    console.log('✅ Contatos de exemplo criados');
  } else {
    console.log('⏭️ Contatos já existem, pulando...');
  }

  // Cria prompts padrão de IA
  console.log('\n🤖 Criando prompts de IA...');
  for (const prompt of Object.values(DEFAULT_PROMPTS)) {
    await prisma.systemSetting.upsert({
      where: { key: prompt.key },
      update: {}, // Não atualiza se já existir (permite customização)
      create: {
        key: prompt.key,
        value: prompt.value,
        category: SettingCategory.PROMPTS,
        isEncrypted: false,
        description: prompt.description,
        updatedById: admin.id,
      },
    });
  }
  console.log('✅ Prompts de IA criados:', Object.keys(DEFAULT_PROMPTS).length);

  // Cria settings de convite de contatos
  console.log('\n📨 Criando settings de convite de contatos...');
  for (const setting of Object.values(CONTACT_INVITE_SETTINGS)) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {}, // Não atualiza se já existir (permite customização)
      create: {
        key: setting.key,
        value: setting.value,
        category: setting.category === 'SYSTEM' ? SettingCategory.SYSTEM : SettingCategory.PROMPTS,
        isEncrypted: false,
        description: setting.description,
        updatedById: admin.id,
      },
    });
  }
  console.log('✅ Settings de convite criados:', Object.keys(CONTACT_INVITE_SETTINGS).length);

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais:');
  console.log('   Super Admin (PROD): supa@hprod.io / [ver .env.prod]');
  console.log('   Admin (DEV): admin@netloop.com / admin123');
  console.log('   Usuário: teste@netloop.com / user123');
  console.log('   Club Admin SOMA: admin@soma.club / soma123 (login em /club-login)');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
