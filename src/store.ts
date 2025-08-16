import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  age?: number
  bio?: string
  photos: string[]
}

interface Match {
  id: string
  userId: string
  name: string
  age: number
  bio: string
  photo: string
  matchedAt: Date
  lastMessage?: Message
  unreadCount: number
}

interface Message {
  id: string
  matchId: string
  senderId: string
  text: string
  timestamp: Date
  read: boolean
}

interface AuthState {
  user: User | null
  matches: Match[]
  messages: Message[]
  isLoading: boolean
  error: string | null
  
  // Auth actions
  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, name: string, age?: number) => Promise<boolean>
  logout: () => void
  clearError: () => void
  
  // App actions
  likeProfile: (id: string) => void
  updateProfile: (updates: Partial<User>) => void
  
  // Chat actions
  sendMessage: (matchId: string, text: string) => void
  markMessagesAsRead: (matchId: string) => void
  getMessagesForMatch: (matchId: string) => Message[]
  
  // Match management actions
  unmatchUser: (matchId: string) => void
  deleteConversation: (matchId: string) => void
  
  // Utility actions
  clearCorruptedData: () => void
}

// Mock database - em produção seria uma API real
const mockUsers = new Map<string, { email: string; password: string; user: User }>()

// Mock profiles data
const mockProfiles = [
  { id: 'u1', name: 'Mariana', age: 24, bio: 'Amo surf e café', photo: '/assets/m1.jpg' },
  { id: 'u2', name: 'Lucas', age: 27, bio: 'Skate e beats', photo: '/assets/m2.jpg' },
  { id: 'u3', name: 'Ana', age: 22, bio: 'Designer e gamer', photo: '/assets/m3.jpg' }
]

// Função para limpar dados corrompidos
const clearCorruptedData = () => {
  try {
    localStorage.removeItem('tinder-auth-storage')
    console.log('Dados corrompidos limpos')
  } catch (error) {
    console.error('Erro ao limpar dados:', error)
  }
}

export const useStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      matches: [],
      messages: [],
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        
        try {
          // Simular delay de rede
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const userData = mockUsers.get(email)
          if (!userData || userData.password !== password) {
            set({ error: 'Email ou senha incorretos', isLoading: false })
            return false
          }

          set({ user: userData.user, isLoading: false })
          return true
        } catch (error) {
          set({ error: 'Erro ao fazer login', isLoading: false })
          return false
        }
      },

      register: async (email: string, password: string, name: string, age?: number) => {
        set({ isLoading: true, error: null })
        
        try {
          // Simular delay de rede
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          if (mockUsers.has(email)) {
            set({ error: 'Email já cadastrado', isLoading: false })
            return false
          }

          const newUser: User = {
            id: Date.now().toString(),
            email,
            name,
            age,
            bio: '',
            photos: []
          }

          mockUsers.set(email, { email, password, user: newUser })
          set({ user: newUser, isLoading: false })
          return true
        } catch (error) {
          set({ error: 'Erro ao criar conta', isLoading: false })
          return false
        }
      },

      logout: () => {
        // Limpar localStorage completamente
        try {
          localStorage.removeItem('tinder-auth-storage')
        } catch (error) {
          console.error('Erro ao limpar localStorage:', error)
        }
        set({ user: null, matches: [], messages: [], error: null })
      },

      clearError: () => {
        set({ error: null })
      },

      updateProfile: (updates: Partial<User>) => {
        const currentUser = get().user
        if (currentUser) {
          const updatedUser = { ...currentUser, ...updates }
          set({ user: updatedUser })
          
          // Atualizar no mock database
          const userData = mockUsers.get(currentUser.email)
          if (userData) {
            mockUsers.set(currentUser.email, { ...userData, user: updatedUser })
          }
        }
      },

      likeProfile: (id) => {
        // mock: 50% chance de match
        if (Math.random() > 0.5) {
          const profile = mockProfiles.find(p => p.id === id)
          if (profile) {
            const matchDate = new Date()
            const newMatch: Match = {
              id: `match_${Date.now()}`,
              userId: profile.id,
              name: profile.name,
              age: profile.age,
              bio: profile.bio,
              photo: profile.photo,
              matchedAt: matchDate,
              unreadCount: 0
            }
            
            set({ matches: [...get().matches, newMatch] })
            
            // Simular mensagem automática após 2 segundos
            setTimeout(() => {
              const welcomeMessage: Message = {
                id: `msg_${Date.now()}`,
                matchId: newMatch.id,
                senderId: profile.id,
                text: `Oi! Que bom que deu match! 😊`,
                timestamp: new Date(),
                read: false
              }
              
              const currentState = get()
              set({
                messages: [...currentState.messages, welcomeMessage],
                matches: currentState.matches.map(m => 
                  m.id === newMatch.id 
                    ? { ...m, lastMessage: welcomeMessage, unreadCount: 1 }
                    : m
                )
              })
            }, 2000)
          }
        }
      },

      sendMessage: (matchId: string, text: string) => {
        const currentUser = get().user
        if (!currentUser) return

        const newMessage: Message = {
          id: `msg_${Date.now()}`,
          matchId,
          senderId: currentUser.id,
          text,
          timestamp: new Date(),
          read: true
        }

        const currentState = get()
        set({
          messages: [...currentState.messages, newMessage],
          matches: currentState.matches.map(m => 
            m.id === matchId 
              ? { ...m, lastMessage: newMessage }
              : m
          )
        })

        // Simular resposta automática após 3-8 segundos
        const responseDelay = Math.random() * 5000 + 3000
        setTimeout(() => {
          const responses = [
            "Que legal! 😄",
            "Concordo totalmente!",
            "Haha, adorei! 😂",
            "Que interessante!",
            "Me conta mais sobre isso!",
            "Também gosto disso! ❤️",
            "Que coincidência!",
            "Parece que temos muito em comum! 😊"
          ]
          
          const match = get().matches.find(m => m.id === matchId)
          if (match) {
            const responseMessage: Message = {
              id: `msg_${Date.now()}`,
              matchId,
              senderId: match.userId,
              text: responses[Math.floor(Math.random() * responses.length)],
              timestamp: new Date(),
              read: false
            }

            const currentState = get()
            set({
              messages: [...currentState.messages, responseMessage],
              matches: currentState.matches.map(m => 
                m.id === matchId 
                  ? { ...m, lastMessage: responseMessage, unreadCount: m.unreadCount + 1 }
                  : m
              )
            })
          }
        }, responseDelay)
      },

      markMessagesAsRead: (matchId: string) => {
        const currentState = get()
        
        // Verificar se há mensagens não lidas para evitar updates desnecessários
        const hasUnreadMessages = currentState.messages.some(msg => 
          msg.matchId === matchId && !msg.read
        )
        
        const matchHasUnreadCount = currentState.matches.some(m => 
          m.id === matchId && m.unreadCount > 0
        )
        
        if (!hasUnreadMessages && !matchHasUnreadCount) {
          return // Não há nada para atualizar
        }
        
        set({
          messages: currentState.messages.map(msg => 
            msg.matchId === matchId && !msg.read ? { ...msg, read: true } : msg
          ),
          matches: currentState.matches.map(m => 
            m.id === matchId && m.unreadCount > 0 ? { ...m, unreadCount: 0 } : m
          )
        })
      },

      getMessagesForMatch: (matchId: string) => {
        const state = get()
        if (!Array.isArray(state.messages)) {
          console.error('Messages não é um array:', state.messages)
          return []
        }
        
        try {
          return state.messages
            .filter(msg => msg && msg.matchId === matchId)
            .sort((a, b) => {
              const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime()
              const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime()
              return timeA - timeB
            })
        } catch (error) {
          console.error('Erro ao buscar mensagens:', error)
          return []
        }
      },

      unmatchUser: (matchId: string) => {
        const currentState = get()
        
        // Remover o match e todas as mensagens relacionadas
        set({
          matches: currentState.matches.filter(m => m.id !== matchId),
          messages: currentState.messages.filter(msg => msg.matchId !== matchId)
        })
      },

      deleteConversation: (matchId: string) => {
        const currentState = get()
        
        // Manter o match mas remover todas as mensagens e resetar contador
        set({
          messages: currentState.messages.filter(msg => msg.matchId !== matchId),
          matches: currentState.matches.map(m => 
            m.id === matchId 
              ? { ...m, lastMessage: undefined, unreadCount: 0 }
              : m
          )
        })
      },

      clearCorruptedData: () => {
        try {
          localStorage.removeItem('tinder-auth-storage')
          set({ user: null, matches: [], messages: [], error: null })
          console.log('Dados corrompidos limpos com sucesso')
        } catch (error) {
          console.error('Erro ao limpar dados corrompidos:', error)
        }
      }
    }),
    {
      name: 'tinder-auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        matches: state.matches, 
        messages: state.messages 
      }),
      // Serializar e deserializar datas corretamente
      serialize: (state) => JSON.stringify(state),
      deserialize: (str) => {
        try {
          const parsed = JSON.parse(str)
          
          // Garantir que matches é sempre um array
          if (!Array.isArray(parsed.matches)) {
            parsed.matches = []
          }
          
          // Garantir que messages é sempre um array
          if (!Array.isArray(parsed.messages)) {
            parsed.messages = []
          }
          
          // Converter strings de data de volta para objetos Date
          if (parsed.matches && Array.isArray(parsed.matches)) {
            parsed.matches = parsed.matches.map((match: any) => {
              try {
                // Garantir que todos os campos obrigatórios existem
                if (!match.id || !match.name) {
                  console.warn('Match inválido encontrado:', match)
                  return null
                }
                
                return {
                  ...match,
                  matchedAt: match.matchedAt ? new Date(match.matchedAt) : new Date(),
                  lastMessage: match.lastMessage ? {
                    ...match.lastMessage,
                    timestamp: match.lastMessage.timestamp ? new Date(match.lastMessage.timestamp) : new Date()
                  } : undefined,
                  unreadCount: match.unreadCount || 0
                }
              } catch (error) {
                console.error('Erro ao processar match:', error)
                return null
              }
            }).filter(Boolean) // Remove matches inválidos
          }
          
          if (parsed.messages && Array.isArray(parsed.messages)) {
            parsed.messages = parsed.messages.map((message: any) => {
              try {
                return {
                  ...message,
                  timestamp: message.timestamp ? new Date(message.timestamp) : new Date()
                }
              } catch (error) {
                console.error('Erro ao processar mensagem:', error)
                return null
              }
            }).filter(Boolean) // Remove mensagens inválidas
          }
          
          return parsed
        } catch (error) {
          console.error('Erro ao deserializar dados:', error)
          // Retornar estado padrão em caso de erro
          return {
            user: null,
            matches: [],
            messages: []
          }
        }
      }
    }
  )
)
