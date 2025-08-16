import React, { useState, useRef } from 'react'
import { useStore } from '../store'

interface ProfileEditorProps {
  onClose: () => void
}

export function ProfileEditor({ onClose }: ProfileEditorProps) {
  const { user, updateProfile } = useStore()
  const [name, setName] = useState(user?.name || '')
  const [age, setAge] = useState(user?.age?.toString() || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [photos, setPhotos] = useState<string[]>(user?.photos || [])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    if (!user) return

    updateProfile({
      name: name.trim(),
      age: age ? parseInt(age) : undefined,
      bio: bio.trim(),
      photos
    })
    onClose()
  }

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    setIsUploading(true)

    // Simular upload de fotos (em produção seria um upload real)
    Array.from(files).forEach((file, index) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        setTimeout(() => {
          setPhotos(prev => [...prev, result])
          if (index === files.length - 1) {
            setIsUploading(false)
          }
        }, 500 * (index + 1)) // Simular delay de upload
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const movePhoto = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= photos.length) return
    
    const newPhotos = [...photos]
    const [movedPhoto] = newPhotos.splice(fromIndex, 1)
    newPhotos.splice(toIndex, 0, movedPhoto)
    setPhotos(newPhotos)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900">Editar Perfil</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Photos Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Suas Fotos</h3>
            
            {/* Photo Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {photos.map((photo, index) => (
                <div key={index} className="relative group">
                  <img
                    src={photo}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  
                  {/* Photo Controls */}
                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center space-x-2">
                    {index > 0 && (
                      <button
                        onClick={() => movePhoto(index, index - 1)}
                        className="p-2 bg-white bg-opacity-20 rounded-full text-white hover:bg-opacity-30 transition-colors"
                        title="Mover para esquerda"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    
                    <button
                      onClick={() => removePhoto(index)}
                      className="p-2 bg-red-500 bg-opacity-80 rounded-full text-white hover:bg-opacity-100 transition-colors"
                      title="Remover foto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    
                    {index < photos.length - 1 && (
                      <button
                        onClick={() => movePhoto(index, index + 1)}
                        className="p-2 bg-white bg-opacity-20 rounded-full text-white hover:bg-opacity-30 transition-colors"
                        title="Mover para direita"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  {/* Main Photo Indicator */}
                  {index === 0 && (
                    <div className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full">
                      Principal
                    </div>
                  )}
                </div>
              ))}
              
              {/* Add Photo Button */}
              {photos.length < 6 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                  ) : (
                    <>
                      <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-sm">Adicionar</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />

            <p className="text-xs text-gray-500">
              Adicione até 6 fotos. A primeira será sua foto principal.
            </p>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Informações Básicas</h3>
            
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Nome
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Seu nome"
              />
            </div>

            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-2">
                Idade
              </label>
              <input
                id="age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Sua idade"
                min="18"
                max="100"
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-2">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={500}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              placeholder="Conte um pouco sobre você..."
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-500">
                Descreva seus interesses, hobbies ou algo interessante sobre você
              </p>
              <span className="text-xs text-gray-400">
                {bio.length}/500
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex space-x-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg hover:from-red-600 hover:to-pink-600 transition-all"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}