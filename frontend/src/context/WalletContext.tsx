'use client'
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode
} from 'react'

interface WalletContextType {
  accountId: string | null
  isConnected: boolean
  isConnecting: boolean
  connect: () => void
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType>({
  accountId: null,
  isConnected: false,
  isConnecting: false,
  connect: () => {},
  disconnect: () => {}
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('agentfi_wallet')
    if (saved && saved.startsWith('0.0.')) {
      setAccountId(saved)
      setIsConnected(true)
    }
  }, [])

  const connect = useCallback(() => {
    if (isConnecting || isConnected) return

    const id = prompt(
      '🔗 Enter your Hedera Account ID:\n\n' +
      'Example: 0.0.8150748\n\n' +
      'Find it at portal.hedera.com'
    )

    if (!id) return

    const trimmed = id.trim()
    if (!trimmed.startsWith('0.0.')) {
      alert('Invalid account ID. Must start with 0.0.')
      return
    }

    setAccountId(trimmed)
    setIsConnected(true)
    localStorage.setItem('agentfi_wallet', trimmed)
  }, [isConnecting, isConnected])

  const disconnect = useCallback(() => {
    setAccountId(null)
    setIsConnected(false)
    setIsConnecting(false)
    localStorage.removeItem('agentfi_wallet')
  }, [])

  return (
    <WalletContext.Provider value={{
      accountId,
      isConnected,
      isConnecting,
      connect,
      disconnect
    }}>
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = () => useContext(WalletContext)
