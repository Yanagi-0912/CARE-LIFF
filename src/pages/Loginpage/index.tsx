import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import liff from '@line/liff'
import { loginWithLiffIdToken } from '../../api/authApi'
import './index.css'

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim()
const LOGIN_CALLBACK_FLAG = 'liffLogin'

let loginRedirectInFlight = false

function getTokenDebugInfo(idToken: string) {
	const parts = idToken.split('.')
	return {
		length: idToken.length,
		parts: parts.length,
		preview: `${idToken.slice(0, 12)}...${idToken.slice(-12)}`,
	}
}

function LoginPage() {
	const navigate = useNavigate()
	const [statusText, setStatusText] = useState('正在初始化 LINE 登入...')
	const [errorText, setErrorText] = useState('')
	const redirectTimerRef = useRef<number | null>(null)

	const redirectToHomeAfterFailure = useCallback((message: string) => {
		setStatusText('登入失敗，3 秒後跳轉到首頁...')
		setErrorText(message)
		loginRedirectInFlight = false

		if (redirectTimerRef.current !== null) {
			window.clearTimeout(redirectTimerRef.current)
		}

		redirectTimerRef.current = window.setTimeout(() => {
			navigate('/', { replace: true })
		}, 3000)
	}, [navigate])

	useEffect(() => {
		let cancelled = false

		const initLiff = async () => {
			if (!LIFF_ID) {
				redirectToHomeAfterFailure('尚未設定 VITE_LIFF_ID，請先完成前端環境變數設定。')
				return
			}

			try {
				await liff.init({ liffId: LIFF_ID })
				if (cancelled) return

				if (!liff.isLoggedIn()) {
					const loginCallbackUrl = new URL(window.location.href)
					const isLoginCallbackReturn = loginCallbackUrl.searchParams.get(LOGIN_CALLBACK_FLAG) === '1'

					if (isLoginCallbackReturn) {
						redirectToHomeAfterFailure('LINE 登入未完成，請重新嘗試登入。')
						return
					}

					if (loginRedirectInFlight) {
						setStatusText('正在導向 LINE 官方登入頁...')
						return
					}

					loginRedirectInFlight = true
					loginCallbackUrl.searchParams.set(LOGIN_CALLBACK_FLAG, '1')
					setStatusText('正在導向 LINE 官方登入頁...')
					liff.login({ redirectUri: loginCallbackUrl.toString() })
					return
				}

				loginRedirectInFlight = false

				const idToken = liff.getIDToken()
				if (!idToken) {
					redirectToHomeAfterFailure('無法取得 LIFF ID token，請重新登入。')
					return
				}

				const tokenDebugInfo = getTokenDebugInfo(idToken)
				console.log('[LIFF login] ID token debug', tokenDebugInfo)

				if (tokenDebugInfo.parts !== 3) {
					redirectToHomeAfterFailure(
						`取得的 LIFF ID token 格式異常（長度 ${tokenDebugInfo.length}，分段 ${tokenDebugInfo.parts}）。請檢查 LIFF 設定與登入回呼。`,
					)
					return
				}

				setStatusText('登入成功，正在驗證身份...')
				const authResult = await loginWithLiffIdToken(idToken)
				localStorage.setItem('CARE_AUTH_TOKEN', authResult.access_token)
				localStorage.setItem('CARE_LINE_USER_ID', authResult.line_user_id)

				setStatusText('驗證成功，正在返回首頁...')
				if (redirectTimerRef.current !== null) {
					window.clearTimeout(redirectTimerRef.current)
					redirectTimerRef.current = null
				}
				navigate('/', { replace: true })
			} catch (error) {
				if (cancelled) return
				redirectToHomeAfterFailure(error instanceof Error ? error.message : 'LIFF 初始化失敗，請稍後再試。')
			}
		}

		void initLiff()

		return () => {
			cancelled = true
			if (redirectTimerRef.current !== null) {
				window.clearTimeout(redirectTimerRef.current)
				redirectTimerRef.current = null
			}
		}
	}, [navigate, redirectToHomeAfterFailure])

	return (
		<main className="login-page">
			<h2 className="login-title">登入 CARE</h2>
			<p className="login-desc">{statusText}</p>
			{errorText && <p className="login-error">{errorText}</p>}
		</main>
	)
}

export default LoginPage