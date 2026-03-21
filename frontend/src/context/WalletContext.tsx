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

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return
    setIsConnecting(true)

    try {
      const { HashConnect } = await import('hashconnect')
      const { LedgerId } = await import('@hashgraph/sdk')

      const hc = new HashConnect(
        LedgerId.TESTNET,
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'agentfi-demo',
        {
          name: 'AgentFi',
          description: 'AI Agent OTC Trading on Hedera',
          icons: [],
          url: typeof window !== 'undefined'
            ? window.location.origin
            : 'https://agentfi.vercel.app'
        },
        false
      )

      await hc.init()

      // Set timeout - stop loading after 2 min
      const timeout = setTimeout(() => {
        setIsConnecting(false)
      }, 120000)

      hc.pairingEvent.once((data: any) => {
        clearTimeout(timeout)
        const id = data?.accountIds?.[0]
        if (id) {
          setAccountId(id)
          setIsConnected(true)
          localStorage.setItem('agentfi_wallet', id)
        }
        setIsConnecting(false)
      })

      hc.openPairingModal()

    } catch (err: any) {
      console.error('Wallet error:', err)
      setIsConnecting(false)

      // Show manual input as fallback
      const manual = prompt(
        'HashPack popup failed.\n\n' +
        'Enter your Hedera Account ID manually:\n' +
        '(e.g. 0.0.12345)'
      )
      if (manual && manual.startsWith('0.0.')) {
        setAccountId(manual)
        setIsConnected(true)
        localStorage.setItem('agentfi_wallet', manual)
      }
    }
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
