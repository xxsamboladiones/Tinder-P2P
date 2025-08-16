import React, { useState, useEffect } from 'react'
import { NetworkDiagnosticsManager, NetworkTroubleshootingResult } from '../p2p/NetworkDiagnosticsManager'
import { P2PManager } from '../p2p/P2PManager'

interface ConnectionTroubleshootingWizardProps {
  onClose: () => void
  p2pManager?: P2PManager
  diagnosticsManager: NetworkDiagnosticsManager
}

type WizardStep = 'welcome' | 'basic-tests' | 'advanced-tests' | 'results' | 'fixes'

interface TestResult {
  name: string
  status: 'pending' | 'running' | 'passed' | 'failed'
  message?: string
  details?: string
}

export function ConnectionTroubleshootingWizard({ 
  onClose, 
  p2pManager, 
  diagnosticsManager 
}: ConnectionTroubleshootingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')
  const [isRunning, setIsRunning] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [troubleshootingResult, setTroubleshootingResult] = useState<NetworkTroubleshootingResult | null>(null)
  const [selectedFixes, setSelectedFixes] = useState<string[]>([])

  const basicTests: TestResult[] = [
    { name: 'Conectividade de Internet', status: 'pending' },
    { name: 'Inicialização do P2P', status: 'pending' },
    { name: 'Configuração WebRTC', status: 'pending' },
    { name: 'Servidores STUN', status: 'pending' }
  ]

  const advancedTests: TestResult[] = [
    { name: 'Conectividade DHT', status: 'pending' },
    { name: 'Descoberta de Peers', status: 'pending' },
    { name: 'Qualidade das Conexões', status: 'pending' },
    { name: 'Latência de Rede', status: 'pending' }
  ]

  useEffect(() => {
    if (currentStep === 'basic-tests' || currentStep === 'advanced-tests') {
      runTests()
    }
  }, [currentStep])

  const runTests = async () => {
    setIsRunning(true)
    const tests = currentStep === 'basic-tests' ? basicTests : advancedTests
    const results: TestResult[] = [...tests]
    setTestResults(results)

    try {
      for (let i = 0; i < results.length; i++) {
        // Update test status to running
        results[i].status = 'running'
        setTestResults([...results])

        // Simulate test execution with actual checks
        await new Promise(resolve => setTimeout(resolve, 1000))

        const testResult = await executeTest(results[i].name)
        results[i] = { ...results[i], ...testResult }
        setTestResults([...results])
      }

      // Run full troubleshooting after tests
      if (currentStep === 'advanced-tests') {
        const fullResult = await diagnosticsManager.runNetworkTroubleshooting()
        setTroubleshootingResult(fullResult)
      }

    } catch (error) {
      console.error('Test execution failed:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const executeTest = async (testName: string): Promise<Partial<TestResult>> => {
    try {
      switch (testName) {
        case 'Conectividade de Internet':
          return await testInternetConnectivity()
        case 'Inicialização do P2P':
          return await testP2PInitialization()
        case 'Configuração WebRTC':
          return await testWebRTCConfiguration()
        case 'Servidores STUN':
          return await testSTUNServers()
        case 'Conectividade DHT':
          return await testDHTConnectivity()
        case 'Descoberta de Peers':
          return await testPeerDiscovery()
        case 'Qualidade das Conexões':
          return await testConnectionQuality()
        case 'Latência de Rede':
          return await testNetworkLatency()
        default:
          return { status: 'failed', message: 'Teste não implementado' }
      }
    } catch (error) {
      return { 
        status: 'failed', 
        message: error instanceof Error ? error.message : 'Erro desconhecido' 
      }
    }
  }

  const testInternetConnectivity = async (): Promise<Partial<TestResult>> => {
    try {
      const response = await fetch('https://www.google.com/favicon.ico', { 
        method: 'HEAD',
        mode: 'no-cors'
      })
      return { 
        status: 'passed', 
        message: 'Conectividade com a internet OK' 
      }
    } catch {
      return { 
        status: 'failed', 
        message: 'Sem conectividade com a internet' 
      }
    }
  }

  const testP2PInitialization = async (): Promise<Partial<TestResult>> => {
    if (!p2pManager?.libp2pInstance) {
      return { 
        status: 'failed', 
        message: 'P2P Manager não inicializado' 
      }
    }

    if (p2pManager.libp2pInstance.status !== 'started') {
      return { 
        status: 'failed', 
        message: 'Nó P2P não está ativo' 
      }
    }

    return { 
      status: 'passed', 
      message: 'P2P inicializado corretamente' 
    }
  }

  const testWebRTCConfiguration = async (): Promise<Partial<TestResult>> => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      
      await new Promise((resolve, reject) => {
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            pc.close()
            resolve(true)
          }
        }
        
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.close()
            reject(new Error('Nenhum candidato ICE encontrado'))
          }
        }
        
        pc.createDataChannel('test')
        pc.createOffer().then(offer => pc.setLocalDescription(offer))
        
        setTimeout(() => {
          pc.close()
          reject(new Error('Timeout na configuração WebRTC'))
        }, 5000)
      })

      return { 
        status: 'passed', 
        message: 'WebRTC configurado corretamente' 
      }
    } catch (error) {
      return { 
        status: 'failed', 
        message: `Erro na configuração WebRTC: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
      }
    }
  }

  const testSTUNServers = async (): Promise<Partial<TestResult>> => {
    const stunServers = [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun.cloudflare.com:3478'
    ]

    let workingServers = 0

    for (const server of stunServers) {
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: server }] })
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            pc.close()
            reject(new Error('Timeout'))
          }, 3000)

          pc.onicecandidate = (event) => {
            if (event.candidate && event.candidate.type === 'srflx') {
              clearTimeout(timeout)
              pc.close()
              resolve(true)
            }
          }

          pc.createDataChannel('test')
          pc.createOffer().then(offer => pc.setLocalDescription(offer))
        })

        workingServers++
      } catch {
        // Server não funcionou
      }
    }

    if (workingServers === 0) {
      return { 
        status: 'failed', 
        message: 'Nenhum servidor STUN acessível' 
      }
    }

    return { 
      status: 'passed', 
      message: `${workingServers}/${stunServers.length} servidores STUN funcionando` 
    }
  }

  const testDHTConnectivity = async (): Promise<Partial<TestResult>> => {
    if (!p2pManager?.libp2pInstance) {
      return { 
        status: 'failed', 
        message: 'P2P Manager não disponível' 
      }
    }

    try {
      const dhtService = p2pManager.libp2pInstance.services.dht as any
      if (!dhtService?.isStarted()) {
        return { 
          status: 'failed', 
          message: 'Serviço DHT não está ativo' 
        }
      }

      const peers = p2pManager.libp2pInstance.getPeers()
      return { 
        status: 'passed', 
        message: `DHT ativo com ${peers.length} peers conhecidos` 
      }
    } catch (error) {
      return { 
        status: 'failed', 
        message: `Erro no DHT: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
      }
    }
  }

  const testPeerDiscovery = async (): Promise<Partial<TestResult>> => {
    if (!p2pManager?.libp2pInstance) {
      return { 
        status: 'failed', 
        message: 'P2P Manager não disponível' 
      }
    }

    const connections = p2pManager.libp2pInstance.getConnections()
    const peers = p2pManager.libp2pInstance.getPeers()

    if (connections.length === 0 && peers.length === 0) {
      return { 
        status: 'failed', 
        message: 'Nenhum peer descoberto ou conectado' 
      }
    }

    return { 
      status: 'passed', 
      message: `${connections.length} conexões ativas, ${peers.length} peers conhecidos` 
    }
  }

  const testConnectionQuality = async (): Promise<Partial<TestResult>> => {
    const diagnostics = diagnosticsManager.getNetworkDiagnostics()
    const peerMetrics = diagnostics.peerMetrics

    if (peerMetrics.length === 0) {
      return { 
        status: 'failed', 
        message: 'Nenhuma métrica de peer disponível' 
      }
    }

    const qualityDistribution = peerMetrics.reduce((acc, peer) => {
      acc[peer.connectionQuality] = (acc[peer.connectionQuality] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const poorConnections = qualityDistribution.poor || 0
    const totalConnections = peerMetrics.length

    if (poorConnections > totalConnections / 2) {
      return { 
        status: 'failed', 
        message: `${poorConnections}/${totalConnections} conexões com qualidade ruim` 
      }
    }

    return { 
      status: 'passed', 
      message: `Qualidade das conexões: ${JSON.stringify(qualityDistribution)}` 
    }
  }

  const testNetworkLatency = async (): Promise<Partial<TestResult>> => {
    const diagnostics = diagnosticsManager.getNetworkDiagnostics()
    const averageLatency = diagnostics.performance.averageLatency

    if (averageLatency === 0) {
      return { 
        status: 'failed', 
        message: 'Não foi possível medir a latência' 
      }
    }

    if (averageLatency > 1000) {
      return { 
        status: 'failed', 
        message: `Latência muito alta: ${averageLatency}ms` 
      }
    }

    if (averageLatency > 500) {
      return { 
        status: 'passed', 
        message: `Latência moderada: ${averageLatency}ms` 
      }
    }

    return { 
      status: 'passed', 
      message: `Latência boa: ${averageLatency}ms` 
    }
  }

  const nextStep = () => {
    switch (currentStep) {
      case 'welcome':
        setCurrentStep('basic-tests')
        break
      case 'basic-tests':
        setCurrentStep('advanced-tests')
        break
      case 'advanced-tests':
        setCurrentStep('results')
        break
      case 'results':
        if (troubleshootingResult?.canAutoFix) {
          setCurrentStep('fixes')
        } else {
          onClose()
        }
        break
      case 'fixes':
        onClose()
        break
    }
  }

  const previousStep = () => {
    switch (currentStep) {
      case 'basic-tests':
        setCurrentStep('welcome')
        break
      case 'advanced-tests':
        setCurrentStep('basic-tests')
        break
      case 'results':
        setCurrentStep('advanced-tests')
        break
      case 'fixes':
        setCurrentStep('results')
        break
    }
  }

  const applyFix = async (fix: string) => {
    try {
      // Implement actual fix logic here
      console.log('Applying fix:', fix)
      
      // Remove from selected fixes after applying
      setSelectedFixes(prev => prev.filter(f => f !== fix))
    } catch (error) {
      console.error('Failed to apply fix:', error)
    }
  }

  const getStepTitle = () => {
    switch (currentStep) {
      case 'welcome': return 'Assistente de Diagnóstico'
      case 'basic-tests': return 'Testes Básicos'
      case 'advanced-tests': return 'Testes Avançados'
      case 'results': return 'Resultados'
      case 'fixes': return 'Correções Automáticas'
    }
  }

  const getTestIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'passed': return '✅'
      case 'failed': return '❌'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{getStepTitle()}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>
          
          {/* Progress indicator */}
          <div className="flex items-center space-x-2 mt-4">
            {['welcome', 'basic-tests', 'advanced-tests', 'results', 'fixes'].map((step, index) => (
              <div
                key={step}
                className={`w-3 h-3 rounded-full ${
                  step === currentStep ? 'bg-red-500' :
                  ['welcome', 'basic-tests', 'advanced-tests', 'results'].indexOf(currentStep) > index ? 'bg-green-500' :
                  'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="text-6xl">🔧</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Assistente de Diagnóstico de Rede P2P
                </h3>
                <p className="text-gray-600">
                  Este assistente irá executar uma série de testes para diagnosticar problemas 
                  de conectividade na sua rede P2P e sugerir correções automáticas.
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">O que será testado:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Conectividade básica de internet</li>
                  <li>• Configuração do sistema P2P</li>
                  <li>• Servidores STUN/TURN</li>
                  <li>• Conectividade DHT</li>
                  <li>• Descoberta e qualidade de peers</li>
                </ul>
              </div>
            </div>
          )}

          {(currentStep === 'basic-tests' || currentStep === 'advanced-tests') && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {currentStep === 'basic-tests' ? 'Executando Testes Básicos' : 'Executando Testes Avançados'}
                </h3>
                <p className="text-gray-600">
                  Por favor, aguarde enquanto executamos os testes de diagnóstico...
                </p>
              </div>

              <div className="space-y-3">
                {testResults.map((test, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      test.status === 'passed' ? 'border-green-200 bg-green-50' :
                      test.status === 'failed' ? 'border-red-200 bg-red-50' :
                      test.status === 'running' ? 'border-blue-200 bg-blue-50' :
                      'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-xl">{getTestIcon(test.status)}</span>
                        <span className="font-medium text-gray-900">{test.name}</span>
                      </div>
                      {test.status === 'running' && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                      )}
                    </div>
                    {test.message && (
                      <p className={`text-sm mt-2 ${
                        test.status === 'passed' ? 'text-green-700' :
                        test.status === 'failed' ? 'text-red-700' :
                        'text-gray-600'
                      }`}>
                        {test.message}
                      </p>
                    )}
                    {test.details && (
                      <p className="text-xs text-gray-500 mt-1">{test.details}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'results' && troubleshootingResult && (
            <div className="space-y-6">
              <div className="text-center">
                <div className={`text-6xl mb-4 ${
                  troubleshootingResult.healthScore >= 80 ? '🟢' :
                  troubleshootingResult.healthScore >= 60 ? '🟡' :
                  troubleshootingResult.healthScore >= 40 ? '🟠' : '🔴'
                }`}>
                  {troubleshootingResult.healthScore >= 80 ? '😊' :
                   troubleshootingResult.healthScore >= 60 ? '😐' :
                   troubleshootingResult.healthScore >= 40 ? '😟' : '😞'}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Diagnóstico Concluído
                </h3>
                <p className={`text-2xl font-bold ${
                  troubleshootingResult.healthScore >= 80 ? 'text-green-600' :
                  troubleshootingResult.healthScore >= 60 ? 'text-yellow-600' :
                  troubleshootingResult.healthScore >= 40 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  Pontuação: {troubleshootingResult.healthScore}/100
                </p>
              </div>

              {troubleshootingResult.issues.length > 0 && (
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-medium text-red-900 mb-3">Problemas Detectados:</h4>
                  <div className="space-y-2">
                    {troubleshootingResult.issues.map((issue, index) => (
                      <div key={index} className="text-sm text-red-800">
                        <span className="font-medium capitalize">{issue.type.replace('_', ' ')}:</span> {issue.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {troubleshootingResult.recommendations.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-3">Recomendações:</h4>
                  <ul className="space-y-1">
                    {troubleshootingResult.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm text-blue-800 flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {troubleshootingResult.canAutoFix && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-3">Correções Automáticas Disponíveis:</h4>
                  <p className="text-sm text-green-800">
                    Encontramos {troubleshootingResult.autoFixActions.length} problema(s) que podem ser corrigidos automaticamente.
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'fixes' && troubleshootingResult && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-6xl mb-4">🔧</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Correções Automáticas
                </h3>
                <p className="text-gray-600">
                  Selecione as correções que deseja aplicar automaticamente.
                </p>
              </div>

              <div className="space-y-3">
                {troubleshootingResult.autoFixActions.map((fix, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedFixes.includes(fix)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFixes(prev => [...prev, fix])
                          } else {
                            setSelectedFixes(prev => prev.filter(f => f !== fix))
                          }
                        }}
                        className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-gray-900">{fix}</span>
                    </div>
                    <button
                      onClick={() => applyFix(fix)}
                      disabled={!selectedFixes.includes(fix)}
                      className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Aplicar
                    </button>
                  </div>
                ))}
              </div>

              {selectedFixes.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    {selectedFixes.length} correção(ões) selecionada(s) para aplicação.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl">
          <div className="flex justify-between">
            <button
              onClick={previousStep}
              disabled={currentStep === 'welcome'}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              
              <button
                onClick={nextStep}
                disabled={isRunning || (currentStep === 'fixes' && selectedFixes.length === 0)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {currentStep === 'welcome' ? 'Iniciar Diagnóstico' :
                 currentStep === 'results' && troubleshootingResult?.canAutoFix ? 'Ver Correções' :
                 currentStep === 'fixes' ? 'Concluir' :
                 isRunning ? 'Executando...' : 'Próximo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}