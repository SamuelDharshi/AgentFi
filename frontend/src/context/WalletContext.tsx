'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
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
  const connectTimeoutRef = useRef<number | null>(null)

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }
  }, [])

  const finishConnecting = useCallback(() => {
    clearConnectTimeout()
    setIsConnecting(false)
  }, [clearConnectTimeout])

  // Check localStorage on load
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
    clearConnectTimeout()

    try {
      // Dynamic import to avoid SSR issues
      const { HashConnect } = await import('hashconnect')
      const { LedgerId } = await import('@hashgraph/sdk')
      const { HashConnectConnectionState } = await import('hashconnect')

      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      
      if (!projectId) {
        alert('Please set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local\n\nGet a free project ID from:\nhttps://cloud.walletconnect.com')
        finishConnecting()
        return
      }

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== 'undefined' ? window.location.origin : 'https://agentfi.vercel.app')

      const hc = new HashConnect(
        LedgerId.TESTNET,
        projectId,
        {
          name: 'AgentFi',
          description: 'AI Agent OTC Trading on Hedera',
          icons: [`${appUrl}/favicon.ico`],
          url: appUrl
        },
        false
      )

      // Suppress WalletConnect internal errors via custom logger
      ;(hc as any).logger = {
        info: () => {},
        warn: () => {},
        error: (msg: any) => {
          // Silently ignore WalletConnect errors
          console.warn('HC internal (ignored):', msg)
        },
        trace: () => {},
        debug: () => {}
      }

      hc.connectionStatusChangeEvent.on((status: any) => {
        if (
          status === HashConnectConnectionState.Connected ||
          status === HashConnectConnectionState.Paired ||
          status === HashConnectConnectionState.Disconnected
        ) {
          finishConnecting()
        }
      })

      await hc.init()

      // Listen for pairing BEFORE opening modal
      hc.pairingEvent.once((pairingData: any) => {
        const id = pairingData?.accountIds?.[0]
        if (id) {
          setAccountId(id)
          setIsConnected(true)
          localStorage.setItem('agentfi_wallet', id)
        }
        finishConnecting()
      })

      // Open HashPack popup
      hc.openPairingModal()

      connectTimeoutRef.current = window.setTimeout(() => {
        finishConnecting()
        alert('HashPack did not finish connecting. Open HashPack and confirm the pairing, then try again.')
      }, 60000)

    } catch (err: any) {
      console.error('HashPack error:', err)
      finishConnecting()
      
      // Silent handling for WalletConnect errors
      if (err?.message?.includes('WalletConnect') || err?.message?.includes('unauthorized') || err?.message?.includes('invalid key')) {
        console.warn('WalletConnect error (non-critical):', err.message)
        alert(
          'HashPack connection requires a valid WalletConnect project ID.\n\n' +
          'Please get a free project ID from:\n' +
          'https://cloud.walletconnect.com\n\n' +
          'Then add it to .env.local as:\n' +
          'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id'
        )
        return
      }
      
      alert(
        'HashPack connection failed.\n\n' +
        'Make sure:\n' +
        '1. HashPack extension is installed\n' +
        '2. HashPack is set to TESTNET\n' +
        '3. HashPack is unlocked\n\n' +
        'Error: ' + err?.message
      )
    }
  }, [clearConnectTimeout, finishConnecting, isConnecting, isConnected])

  const disconnect = useCallback(() => {
    setAccountId(null)
    setIsConnected(false)
    setIsConnecting(false)
    clearConnectTimeout()
    localStorage.removeItem('agentfi_wallet')
  }, [clearConnectTimeout])

  useEffect(() => {
    return () => {
      clearConnectTimeout()
    }
  }, [clearConnectTimeout])

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
