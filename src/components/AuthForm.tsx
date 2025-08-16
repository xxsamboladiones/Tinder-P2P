import React, { useState } from 'react'
import { useStore } from '../store'

type AuthMode = 'login' | 'register'

export function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const { login, register, isLoading, error, clearError } = useStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (!email.trim() || !password.trim()) {
      return
    }

    if (mode === 'register' && !name.trim()) {
      return
    }

    const success = mode === 'login' 
      ? await login(email, password)
      : await register(email, password, name, age ? parseInt(age) : undefined)

    if (success) {
      // Reset form
      setEmail('')
      setPassword('')
      setName('')
      setAge('')
    }
  }

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    clearError()
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {mode === 'login' ? 'Entrar' : 'Criar Conta'}
          </h1>
          <p className="text-gray-600">
            {mode === 'login' 
              ? 'Entre na sua conta para continuar' 
              : 'Crie sua conta para começar'}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name field (only for register) */}
          {mode === 'register' && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Nome completo
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                placeholder="Seu nome completo"
                required={mode === 'register'}
              />
            </div>
          )}

          {/* Age field (only for register) */}
          {mode === 'register' && (
            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-2">
                Idade (opcional)
              </label>
              <input
                id="age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                placeholder="Sua idade"
                min="18"
                max="100"
              />
            </div>
          )}

          {/* Email field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
              placeholder="seu@email.com"
              required
            />
          </div>

          {/* Password field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors"
                placeholder="Sua senha"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {mode === 'register' && (
              <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                {mode === 'login' ? 'Entrando...' : 'Criando conta...'}
              </div>
            ) : (
              mode === 'login' ? 'Entrar' : 'Criar Conta'
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="mt-8 text-center">
          <p className="text-gray-600">
            {mode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}
            <button
              onClick={toggleMode}
              className="ml-2 text-red-500 hover:text-red-600 font-semibold transition-colors"
            >
              {mode === 'login' ? 'Criar conta' : 'Fazer login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}