import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import liff from '@line/liff'
import { loginWithLiffIdToken } from '../../api/authApi'
import {
	consumeRedirectUrl,
	peekRedirectUrl,
	redirectFromSearch,
	resolveAppPath,
	saveRedirectUrl,
} from '../../utils/redirect'
import Heartbeat from '../../components/Heartbeat/Heartbeat'

const LIFF_ID = (import.meta.env.VITE_LIFF_ID ?? '').trim()

function LoginPage() {
	const navigate = useNavigate()
	const location = useLocation()
	const [statusText, setStatusText] = useState('正在初始化 LINE 登入...')
	const [errorText, setErrorText] = useState('')

	useEffect(() => {
		let cancelled = false

		const initLiff = async () => {
			if (!LIFF_ID) {
				setErrorText('尚未設定 VITE_LIFF_ID，請先完成前端環境變數設定。')
				return
			}

			// OAuth 回來後優先吃 URL ?redirect=（比 sessionStorage 穩）
			const fromQuery = redirectFromSearch(location.search)
			if (fromQuery) {
				saveRedirectUrl(fromQuery)
			}

			try {
				await liff.init({ liffId: LIFF_ID })
				if (cancelled) return

				if (!liff.isLoggedIn()) {
					setStatusText('正在導向 LINE 官方登入頁...')
					const pending =
						fromQuery || peekRedirectUrl() || redirectFromSearch(location.search)
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
				localStorage.setItem('CARE_AUTH_TOKEN', authResult.access_token)
				localStorage.setItem('CARE_LINE_USER_ID', authResult.line_user_id)

				setStatusText('驗證成功，正在返回...')
				const redirectUrl =
					fromQuery || consumeRedirectUrl() || redirectFromSearch(location.search)
				if (redirectUrl) {
					navigate(resolveAppPath(redirectUrl), { replace: true })
				} else {
					navigate('/', { replace: true })
				}
			} catch (error) {
				if (cancelled) return
				setErrorText(error instanceof Error ? error.message : 'LIFF 初始化失敗，請稍後再試。')
			}
		}

		void initLiff()

		return () => {
			cancelled = true
		}
	}, [navigate, location.search])

	return (
		<main className="animate-rise mx-auto mt-14 max-w-[420px] rounded-xl border border-hair bg-surface px-6 py-12 text-center shadow-pop">
			<Heartbeat tone="onLight" className="mx-auto mb-4 max-w-[220px]" />
			<h2 className="m-0 text-[1.6rem] font-extrabold text-ink">登入 CARE</h2>
			<p className="mt-4 mb-6 text-muted-foreground">{statusText}</p>
			{errorText && (
				<p className="m-0 rounded-md bg-destructive-soft p-3 text-[0.9rem] font-semibold text-destructive">
					{errorText}
				</p>
			)}
		</main>
	)
}

export default LoginPage
