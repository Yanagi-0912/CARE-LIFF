import { act, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import liff from '@line/liff'

import LoginPage from '../pages/Loginpage'
import { loginWithLiffIdToken } from '../api/authApi'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
	const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
	return {
		...actual,
		useNavigate: () => mockNavigate,
	}
})

vi.mock('@line/liff', () => ({
	default: {
		init: vi.fn(),
		isLoggedIn: vi.fn(),
		getIDToken: vi.fn(),
		login: vi.fn(),
	},
}))

vi.mock('../api/authApi', () => ({
	loginWithLiffIdToken: vi.fn(),
}))

describe('LoginPage', () => {
	beforeEach(() => {
		vi.useFakeTimers()
		mockNavigate.mockClear()
		localStorage.clear()
		vi.mocked(liff.init).mockResolvedValue(undefined)
		vi.mocked(liff.isLoggedIn).mockReturnValue(true)
		vi.mocked(liff.getIDToken).mockReturnValue('mock-id-token')
		vi.mocked(loginWithLiffIdToken).mockResolvedValue({
			access_token: 'mock-token',
			token_type: 'bearer',
			expires_in: 3600,
			line_user_id: 'mock-line-user-id',
		})
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it('登入失敗時會顯示訊息並在 3 秒後跳轉到首頁', async () => {
		vi.mocked(liff.init).mockRejectedValueOnce(new Error('LIFF 初始化失敗'))

		render(
			<BrowserRouter>
				<LoginPage />
			</BrowserRouter>,
		)

		await act(async () => {
			await Promise.resolve()
		})

		expect(screen.getByText('登入失敗，3 秒後跳轉到首頁...')).toBeInTheDocument()
		expect(screen.getByText('LIFF 初始化失敗')).toBeInTheDocument()

		await act(async () => {
			await vi.advanceTimersByTimeAsync(3000)
		})

		expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
	})

	it('當已經走過 LINE 回呼但仍未登入時，會顯示失敗而不是再次導向 LINE', async () => {
		vi.mocked(liff.isLoggedIn).mockReturnValue(false)
		window.history.replaceState({}, '', '/login?liffLogin=1')

		render(
			<BrowserRouter>
				<LoginPage />
			</BrowserRouter>,
		)

		await act(async () => {
			await Promise.resolve()
		})

		expect(screen.getByText('登入失敗，3 秒後跳轉到首頁...')).toBeInTheDocument()
		expect(screen.getByText('LINE 登入未完成，請重新嘗試登入。')).toBeInTheDocument()

		await act(async () => {
			await vi.advanceTimersByTimeAsync(3000)
		})

		expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
		expect(vi.mocked(liff.login)).not.toHaveBeenCalled()
	})

	it('當取得的 ID token 格式不是三段時，會直接失敗並不送出後端請求', async () => {
		vi.mocked(liff.getIDToken).mockReturnValue('invalid-token')

		render(
			<BrowserRouter>
				<LoginPage />
			</BrowserRouter>,
		)

		await act(async () => {
			await Promise.resolve()
		})

		expect(screen.getByText('登入失敗，3 秒後跳轉到首頁...')).toBeInTheDocument()
		expect(screen.getByText(/取得的 LIFF ID token 格式異常/)).toBeInTheDocument()
		expect(vi.mocked(loginWithLiffIdToken)).not.toHaveBeenCalled()

		await act(async () => {
			await vi.advanceTimersByTimeAsync(3000)
		})

		expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
	})
})