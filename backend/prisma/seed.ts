import { PrismaClient, UserRole, TagType, ConnectionStrength } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Cria usuário admin
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
  console.log('✅ Admin criado:', admin.email);

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

  // Cria grupo SOMA
  const group = await prisma.group.upsert({
    where: { slug: 'soma' },
    update: {},
    create: {
      name: 'SOMA',
      slug: 'soma',
      description: 'Comunidade de empreendedores',
    },
  });
  console.log('✅ Grupo criado:', group.name);

  // Adiciona usuário ao grupo
  await prisma.groupMember.upsert({
    where: {
      userId_groupId: {
        userId: user.id,
        groupId: group.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      groupId: group.id,
      isAdmin: false,
    },
  });
  console.log('✅ Usuário adicionado ao grupo SOMA');

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
        groupId: null,
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

  // Cria tag institucional para o grupo SOMA
  const existingInstitutionalTag = await prisma.tag.findFirst({
    where: {
      slug: 'membro-soma',
      groupId: group.id,
    },
  });

  if (!existingInstitutionalTag) {
    await prisma.tag.create({
      data: {
        name: 'Membro SOMA',
        slug: 'membro-soma',
        color: '#ef4444',
        type: TagType.INSTITUTIONAL,
        groupId: group.id,
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

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log('\n📋 Credenciais:');
  console.log('   Admin: admin@netloop.com / admin123');
  console.log('   Usuário: teste@netloop.com / user123');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
