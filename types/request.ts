import type {
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

export interface HttpClientOptions {
  baseURL: string
  handlers?: RequestHandlers
  customInterceptors?: HttpClientInterceptors
  axiosConfig?: RequestConfig
}

// 自定义扩展的 Axios 请求配置
export interface CustomRequestConfig {
  // 是否显示全局提示
  showGlobalMessage?: boolean
  // 自定义的成功状态码
  successCode?: number
  // 是否启用 code 判断
  enableCodeCheck?: boolean
}

export type RequestConfig = AxiosRequestConfig & CustomRequestConfig

export type InternalRequestConfig = InternalAxiosRequestConfig &
  CustomRequestConfig

// 响应数据的统一结构
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
}

// 请求处理函数
export interface RequestHandlers {
  /**
   * @description 请求前的 header 处理，如添加 token
   * @param config
   * @returns {InternalRequestConfig}
   */
  handleRequestHeader?: (config: InternalRequestConfig) => InternalRequestConfig

  /**
   * @description 全局消息提示
   * @param message
   */
  handleGlobalMessage?: (message: string) => void

  /**
   * @description 后端返回的特殊 code 码处理，例如 token 失效、需要重新登录等
   * @param code
   * @param message
   */
  handleBackendError?: (code: number, message: string) => void
}

// 拦截器配置类型
export interface HttpClientInterceptors {
  /**
   * 请求成功拦截器
   * @param config 请求配置
   * @returns 修改后的配置或一个返回配置的 Promise
   */
  requestOnFulfilled?: (
    config: InternalRequestConfig
  ) => InternalRequestConfig | Promise<InternalRequestConfig>

  /**
   * 请求失败拦截器
   * @param error 错误对象
   * @returns 一个被 reject 的 Promise
   */
  requestOnRejected?: (error: any) => any

  /**
   * 响应成功拦截器
   * @param response 响应对象
   * @returns 处理后的响应或一个返回响应的 Promise
   */
  responseOnFulfilled?: (response: AxiosResponse<ApiResponse>) => any // 返回 any，因为用户可能想直接返回 data

  /**
   * 响应失败拦截器
   * @param error 错误对象
   * @returns 一个被 reject 的 Promise
   */
  responseOnRejected?: (error: any) => any
}

// 流式请求相关类型定义
export interface StreamRequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  baseURL?: string
  headers?: Record<string, string>
  body?: any
  signal?: AbortSignal
  extractContent?: (val: string) => string
}

export interface StreamCallbacks {
  onMessage?: (chunk: string, fullText: string) => void
  onError?: (error: Error) => void
  onComplete?: (fullText: string) => void
  onStart?: () => void
}

export interface StreamResponse {
  fullText: string
  abort: () => void
}
