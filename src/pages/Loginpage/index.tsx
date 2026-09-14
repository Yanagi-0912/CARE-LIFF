import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import liff, { LIFF_AVAILABLE, initLiff } from '../../lib/liffClient'
import { loginWithLiffIdToken } from '../../api/authApi'
import { clearLoggedOutFlag, hasLoggedOut } from '../../utils/auth'
import { useLiffAuth } from '../../context/LiffAuthProvider'
import {
	consumeRedirectUrl,
	peekRedirectUrl,
	redirectFromSearch,
	resolveAppPath,
	saveRedirectUrl,
} from '../../utils/redirect'
import Heartbeat from '../../components/Heartbeat/Heartbeat'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'


function LoginPage() {
	const navigate = useNavigate()
	const location = useLocation()
	const { markAuthenticated } = useLiffAuth()
	const [statusText, setStatusText] = useState('正在初始化 LINE 登入...')
	const [errorText, setErrorText] = useState('')
	// 使用者主動登出、或登入失敗時停在這裡等他自己按登入，不自動跳 LINE 授權頁
	const [needsManualLogin, setNeedsManualLogin] = useState(false)
	const cancelledRef = useRef(false)
	// liff.init() 成功過沒有：重試時若上一次連 init 都失敗，要先補做一次
	const liffReadyRef = useRef(false)

	useEffect(() => {
		cancelledRef.current = false
		return () => {
			cancelledRef.current = true
		}
	}, [])

	// 任何一步失敗都落到同一個畫面：狀態文字換成失敗說明（不能還掛著「登入成功」），
	// 技術細節放錯誤框，並給一顆重新登入鈕——否則使用者只能關掉 LIFF 重開。
	const showLoginFailure = useCallback((error: unknown) => {
		setStatusText('登入沒有完成，請再試一次。')
		setErrorText(error instanceof Error ? error.message : '')
		setNeedsManualLogin(true)
	}, [])

	// liff.init() 之後的登入流程。自動流程與「重新登入」按鈕共用。
	const runLogin = useCallback(async () => {
		// OAuth 回來後優先吃 URL ?redirect=（比 sessionStorage 穩）
		const fromQuery = redirectFromSearch(location.search)
		if (fromQuery) {
			saveRedirectUrl(fromQuery)
		}

		if (!liff.isLoggedIn()) {
			setStatusText('正在導向 LINE 官方登入頁...')
			const pending = fromQuery || peekRedirectUrl()
			if (pending) {
				saveRedirectUrl(pending)
			}
			// redirectUri 必須在 Endpoint URL 之下；/login?redirect= 可撐過 OAuth
			const redirectUri = pending
				? `${window.location.origin}/login?redirect=${encodeURIComponent(pending)}`
				: `${window.location.origin}/login`
			liff.login({ redirectUri })
			return
		}

		const idToken = liff.getIDToken()
		if (!idToken) {
			throw new Error('無法取得 LIFF ID token')
		}

		setStatusText('登入成功，正在驗證身份...')
		const authResult = await loginWithLiffIdToken(idToken)
		if (cancelledRef.current) return
		localStorage.setItem('CARE_AUTH_TOKEN', authResult.access_token)
		localStorage.setItem('CARE_LINE_USER_ID', authResult.line_user_id)
		// 同步全域狀態，否則 ProtectedRoute 仍以為未登入，會把人踢回 /login
		markAuthenticated()

		setStatusText('驗證成功，正在返回...')
		const redirectUrl = fromQuery || consumeRedirectUrl()
		if (redirectUrl) {
			navigate(resolveAppPath(redirectUrl), { replace: true })
		} else {
			navigate('/', { replace: true })
		}
	}, [location.search, navigate, markAuthenticated])

	useEffect(() => {
		// 區域函式名稱避開 lib/liffClient 的 initLiff（原本同名會把 import 遮掉）
		const bootstrapAndLogin = async () => {
			if (!LIFF_AVAILABLE) {
				// 設定問題，重試也沒用，所以不給按鈕；狀態文字清掉，免得還顯示「正在初始化」
				setStatusText('')
				setErrorText('尚未設定 VITE_LIFF_ID，請先完成前端環境變數設定。')
				return
			}

			try {
				await initLiff()
				liffReadyRef.current = true
				if (cancelledRef.current) return

				// 剛登出就別再自動換發 token 了，否則使用者會被瞬間登回去
				if (hasLoggedOut()) {
					setStatusText('您已登出，需要時可重新登入。')
					setNeedsManualLogin(true)
					return
				}

				await runLogin()
			} catch (error) {
				if (cancelledRef.current) return
				showLoginFailure(error)
			}
		}

		void bootstrapAndLogin()
	}, [runLogin, showLoginFailure])

	const handleManualLogin = async () => {
		clearLoggedOutFlag()
		setNeedsManualLogin(false)
		setErrorText('')
		setStatusText('正在導向 LINE 官方登入頁...')
		try {
			if (!liffReadyRef.current) {
				await initLiff()
				liffReadyRef.current = true
			}
			await runLogin()
		} catch (error) {
			if (cancelledRef.current) return
			showLoginFailure(error)
		}
	}

	return (
		<Card className="animate-in fade-in slide-in-from-bottom-2 duration-300 mx-auto mt-14 max-w-[420px]">
			<CardContent className="flex flex-col gap-4 text-center">
				<Heartbeat tone="onLight" className="mx-auto max-w-[220px]" />
				<h2 className="text-2xl font-extrabold">登入 CARE</h2>
				{statusText && <p className="text-muted-foreground">{statusText}</p>}
				{needsManualLogin && (
					<Button className="w-full rounded-full" onClick={() => void handleManualLogin()}>
						使用 LINE 重新登入
					</Button>
				)}
				{errorText && (
					<Alert variant="destructive">
						<AlertDescription>{errorText}</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	)
}

export default LoginPage
