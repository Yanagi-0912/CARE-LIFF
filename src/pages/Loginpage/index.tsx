import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import liff from '@line/liff'
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

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim()

function LoginPage() {
	const navigate = useNavigate()
	const location = useLocation()
	const { markAuthenticated } = useLiffAuth()
	const [statusText, setStatusText] = useState('正在初始化 LINE 登入...')
	const [errorText, setErrorText] = useState('')
	// 使用者主動登出後停在這裡等他自己按登入，不自動跳 LINE 授權頁
	const [needsManualLogin, setNeedsManualLogin] = useState(false)
	const cancelledRef = useRef(false)

	useEffect(() => {
		cancelledRef.current = false
		return () => {
			cancelledRef.current = true
		}
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
			setErrorText('無法取得 LIFF ID token，請重新登入。')
			return
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
		const initLiff = async () => {
			if (!LIFF_ID) {
				setErrorText('尚未設定 VITE_LIFF_ID，請先完成前端環境變數設定。')
				return
			}

			try {
				await liff.init({ liffId: LIFF_ID })
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
				setErrorText(error instanceof Error ? error.message : 'LIFF 初始化失敗，請稍後再試。')
			}
		}

		void initLiff()
	}, [runLogin])

	const handleManualLogin = async () => {
		clearLoggedOutFlag()
		setNeedsManualLogin(false)
		setErrorText('')
		setStatusText('正在導向 LINE 官方登入頁...')
		try {
			await runLogin()
		} catch (error) {
			if (cancelledRef.current) return
			setErrorText(error instanceof Error ? error.message : '登入失敗，請稍後再試。')
			setNeedsManualLogin(true)
		}
	}

	return (
		<Card className="animate-rise mx-auto mt-14 max-w-[420px]">
			<CardContent className="flex flex-col gap-4 text-center">
				<Heartbeat tone="onLight" className="mx-auto max-w-[220px]" />
				<h2 className="text-2xl font-extrabold">登入 CARE</h2>
				<p className="text-muted-foreground">{statusText}</p>
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
