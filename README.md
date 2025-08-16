# Tinder P2P - Aplicativo de Namoro Descentralizado

Um aplicativo de namoro inovador construído com tecnologias peer-to-peer (P2P) que oferece privacidade, segurança e descentralização completa. Desenvolvido com Electron, React, TypeScript e Tailwind CSS.

## 🚀 Características Principais

### 🔒 Privacidade e Segurança
- **Criptografia End-to-End**: Implementação do protocolo Double Ratchet para mensagens seguras
- **Comunicação P2P**: Sem servidores centrais - dados ficam com os usuários
- **Controles de Privacidade**: Gerenciamento granular de visibilidade de dados
- **Armazenamento Local**: Dados sensíveis nunca saem do dispositivo

### 🌐 Tecnologias P2P Avançadas
- **WebRTC**: Comunicação direta entre peers
- **libp2p**: Stack completo de protocolos P2P
- **DHT (Distributed Hash Table)**: Descoberta descentralizada de peers
- **CRDT (Conflict-free Replicated Data Types)**: Sincronização de dados distribuída
- **Circuit Relay**: Conectividade através de NATs e firewalls

### 💬 Sistema de Chat Avançado
- **Mensagens Criptografadas**: Segurança total nas conversas
- **Chat em Grupo**: Comunicação multi-peer
- **Persistência Offline**: Mensagens salvas localmente
- **Sincronização Automática**: Dados sincronizados entre dispositivos

### 📱 Interface Moderna
- **Swipe Cards**: Interface familiar estilo Tinder
- **Design Responsivo**: Funciona em desktop e mobile
- **Tema Escuro/Claro**: Personalização visual
- **Animações Suaves**: Experiência de usuário fluida

### 🔧 Recursos Técnicos
- **Modo Offline**: Funciona sem conexão à internet
- **Recuperação de Conexão**: Reconexão automática
- **Diagnósticos de Rede**: Ferramentas de troubleshooting
- **Compatibilidade Cross-Browser**: Suporte amplo a navegadores

## 🛠️ Tecnologias Utilizadas

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Desktop**: Electron
- **P2P**: libp2p, WebRTC, y-webrtc
- **Criptografia**: WebCrypto API, Double Ratchet
- **Estado**: Zustand
- **Testes**: Jest, React Testing Library
- **Build**: Vite

## 📦 Instalação e Execução

### Pré-requisitos
- Node.js 18+
- npm ou yarn

### Passos
```bash
# Clone o repositório
git clone https://github.com/xxsamboladiones/Tinder-P2P.git
cd Tinder-P2P

# Instale as dependências
npm install

# Execute em modo desenvolvimento
npm run dev

# Para executar como aplicativo Electron
npm run electron:dev

# Build para produção
npm run build
npm run electron:build
```

## 🏗️ Arquitetura do Sistema

### Componentes Principais

#### P2P Core
- **P2PManager**: Gerenciador principal da rede P2P
- **WebRTCManager**: Conexões WebRTC diretas
- **DHTDiscovery**: Descoberta de peers via DHT
- **CryptoManager**: Criptografia e segurança

#### Comunicação
- **P2PChatManager**: Sistema de chat P2P
- **MessagePersistenceManager**: Persistência de mensagens
- **GroupCommunicationManager**: Chat em grupo

#### Dados e Sincronização
- **ProfileCRDT**: Sincronização de perfis
- **OfflineDataManager**: Gerenciamento offline
- **MediaStorageManager**: Armazenamento de mídia

#### Privacidade
- **PrivacyManager**: Controles de privacidade
- **MediaPrivacyManager**: Privacidade de mídia
- **PSIManager**: Private Set Intersection

### Fluxo de Dados
```
Usuario → Interface React → P2PManager → libp2p → WebRTC → Peer Remoto
```

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Testes com coverage
npm run test:coverage

# Testes em modo watch
npm run test:watch
```

## 📁 Estrutura do Projeto

```
src/
├── components/          # Componentes React
│   ├── SwipeDeck.tsx   # Interface principal de swipe
│   ├── ChatWindow.tsx  # Janela de chat
│   └── __tests__/      # Testes dos componentes
├── p2p/                # Sistema P2P
│   ├── P2PManager.ts   # Gerenciador principal
│   ├── WebRTCManager.ts # WebRTC
│   ├── CryptoManager.ts # Criptografia
│   └── __tests__/      # Testes P2P
├── store.ts            # Estado global
└── types.ts            # Definições de tipos
```

## 🔐 Segurança e Privacidade

### Medidas Implementadas
- ✅ Criptografia end-to-end em todas as comunicações
- ✅ Chaves privadas nunca deixam o dispositivo
- ✅ Dados pessoais armazenados apenas localmente
- ✅ Comunicação direta peer-to-peer
- ✅ Controles granulares de privacidade

### Considerações Legais
- **LGPD/GDPR Compliance**: Dados processados localmente
- **Consentimento**: Interface clara para permissões
- **Direito ao Esquecimento**: Dados podem ser deletados localmente
- **Transparência**: Código aberto para auditoria

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## ⚠️ Aviso Legal

Este é um projeto educacional e de demonstração. Para uso em produção:
- Realize auditoria de segurança completa
- Implemente medidas adicionais de proteção
- Consulte especialistas em privacidade e segurança
- Verifique conformidade com leis locais

## 📞 Suporte

- 🐛 **Issues**: [GitHub Issues](https://github.com/xxsamboladiones/Tinder-P2P/issues)
- 💬 **Discussões**: [GitHub Discussions](https://github.com/xxsamboladiones/Tinder-P2P/discussions)
- 📧 **Email**: [Contato do desenvolvedor]

---

**Desenvolvido com ❤️ para um futuro mais privado e descentralizado**
