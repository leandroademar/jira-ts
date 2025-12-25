/**
 * @fileoverview Módulo de serviços para integração com a API do Jira.
 * 
 * Este módulo fornece uma camada de abstração completa para comunicação
 * com o servidor proxy da API do Jira, incluindo:
 * - Funções de fetch para tickets, usuários e detalhes
 * - Utilitários para formatação de datas
 * - Processamento de Atlassian Document Format (ADF)
 * - Gestão de prioridades e status
 * - Classificação de comentários (internos vs cliente)
 * 
 * @module api/jira
 * @author Equipe de Desenvolvimento
 * @version 3.0.0
 * @since 2024-01-01
 * @license MIT
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/} Jira REST API v3
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/} ADF Specification
 * 
 * @example
 * // Importação e uso básico
 * import { 
 *   fetchMyTickets, 
 *   fetchCurrentUser, 
 *   formatDate,
 *   extractTextFromADF 
 * } from './api/jira';
 * 
 * // Buscar tickets
 * const tickets = await fetchMyTickets();
 * 
 * // Formatar data
 * const formattedDate = formatDate('2024-01-15T10:30:00.000Z');
 */

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

/**
 * URL base da API, determinada pelo ambiente de execução.
 * 
 * - Produção: Usa caminho relativo '/api' (mesmo domínio)
 * - Desenvolvimento: Usa servidor local na porta 3003
 * 
 * @constant {string}
 * @private
 */
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3003/api';

/**
 * Configurações padrão para requisições HTTP.
 * 
 * @constant {Object}
 * @property {number} timeout - Timeout em milissegundos (30 segundos)
 * @property {number} retryAttempts - Número de tentativas em caso de falha
 * @property {number} retryDelay - Delay entre tentativas em ms
 */
const REQUEST_CONFIG = Object.freeze({
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
});

/**
 * Headers padrão para todas as requisições à API.
 * 
 * @constant {Object}
 * @private
 */
const DEFAULT_HEADERS = Object.freeze({
  'Accept': 'application/json',
  'Content-Type': 'application/json'
});

/**
 * Configurações de localização para formatação de datas.
 * 
 * @constant {Object}
 * @property {string} locale - Código do locale (pt-BR)
 * @property {string} timezone - Timezone padrão
 */
const LOCALE_CONFIG = Object.freeze({
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo'
});

// ============================================================================
// CONFIGURAÇÕES DE STATUS E PRIORIDADE
// ============================================================================

/**
 * Mapeamento de níveis de prioridade para classes CSS.
 * 
 * @constant {Object.<string, Object>}
 * @property {string} className - Classe CSS para estilização
 * @property {string} color - Cor hexadecimal associada
 * @property {string} label - Rótulo traduzido para exibição
 * @property {number} weight - Peso para ordenação (menor = mais urgente)
 */
const PRIORITY_MAP = Object.freeze({
  highest: {
    className: 'ticket-priority-highest',
    color: '#d73a4a',
    label: 'Urgentíssima',
    weight: 1
  },
  high: {
    className: 'ticket-priority-high',
    color: '#e85d04',
    label: 'Alta',
    weight: 2
  },
  medium: {
    className: 'ticket-priority-medium',
    color: '#f9c74f',
    label: 'Média',
    weight: 3
  },
  low: {
    className: 'ticket-priority-low',
    color: '#90be6d',
    label: 'Baixa',
    weight: 4
  },
  lowest: {
    className: 'ticket-priority-lowest',
    color: '#43aa8b',
    label: 'Muito Baixa',
    weight: 5
  }
});

/**
 * Grupos e roles que identificam comentários internos (não visíveis para clientes).
 * 
 * @constant {Object}
 * @property {string[]} roles - Roles do Jira consideradas internas
 * @property {string[]} groups - Grupos do Jira considerados internos
 */
const INTERNAL_VISIBILITY = Object.freeze({
  roles: [
    'Administrators',
    'jira-servicedesk-users',
    'Service Desk Team',
    'Agents',
    'servicedesk-users',
    'jira-administrators',
    'atlassian-addons-admin',
    'developers'
  ],
  groups: [
    'jira-servicedesk-users',
    'jira-administrators',
    'servicedesk-agents',
    'jira-software-users',
    'site-admins'
  ]
});

// ============================================================================
// CLASSES DE ERRO CUSTOMIZADAS
// ============================================================================

/**
 * Erro específico para falhas na API do Jira.
 * 
 * @class JiraApiError
 * @extends Error
 * 
 * @property {number} status - Código de status HTTP
 * @property {string} statusText - Texto do status HTTP
 * @property {string} endpoint - Endpoint que causou o erro
 * @property {Object} [details] - Detalhes adicionais do erro
 * 
 * @example
 * try {
 *   await fetchMyTickets();
 * } catch (error) {
 *   if (error instanceof JiraApiError) {
 *     console.log(`Erro ${error.status} em ${error.endpoint}`);
 *   }
 * }
 */
class JiraApiError extends Error {
  /**
   * Cria uma instância de JiraApiError.
   * 
   * @param {string} message - Mensagem de erro
   * @param {number} status - Código de status HTTP
   * @param {string} [statusText=''] - Texto do status
   * @param {string} [endpoint=''] - Endpoint da requisição
   * @param {Object} [details=null] - Detalhes adicionais
   */
  constructor(message, status, statusText = '', endpoint = '', details = null) {
    super(message);
    this.name = 'JiraApiError';
    this.status = status;
    this.statusText = statusText;
    this.endpoint = endpoint;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Mantém o stack trace correto
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JiraApiError);
    }
  }

  /**
   * Retorna uma representação em string do erro.
   * @returns {string} Descrição formatada do erro
   */
  toString() {
    return `[JiraApiError] ${this.status} - ${this.message} (${this.endpoint})`;
  }

  /**
   * Converte o erro para um objeto JSON serializável.
   * @returns {Object} Representação JSON do erro
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      endpoint: this.endpoint,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Erro para timeout de requisição.
 * 
 * @class RequestTimeoutError
 * @extends JiraApiError
 */
class RequestTimeoutError extends JiraApiError {
  /**
   * @param {string} endpoint - Endpoint que sofreu timeout
   * @param {number} timeout - Tempo de timeout em ms
   */
  constructor(endpoint, timeout) {
    super(
      `Requisição excedeu o tempo limite de ${timeout}ms`,
      408,
      'Request Timeout',
      endpoint
    );
    this.name = 'RequestTimeoutError';
    this.timeout = timeout;
  }
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS INTERNAS
// ============================================================================

/**
 * Cria um AbortController com timeout automático.
 * 
 * @private
 * @param {number} timeout - Tempo em milissegundos
 * @returns {Object} Objeto com controller e timeoutId
 */
const createTimeoutController = (timeout) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  return {
    controller,
    timeoutId,
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId)
  };
};

/**
 * Realiza uma requisição HTTP com retry automático.
 * 
 * @private
 * @async
 * @param {string} url - URL completa da requisição
 * @param {Object} options - Opções do fetch
 * @param {number} [retries=REQUEST_CONFIG.retryAttempts] - Tentativas restantes
 * @returns {Promise<Response>} Resposta da requisição
 * @throws {JiraApiError} Se todas as tentativas falharem
 */
const fetchWithRetry = async (url, options, retries = REQUEST_CONFIG.retryAttempts) => {
  const timeout = createTimeoutController(REQUEST_CONFIG.timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: timeout.signal
    });
    
    timeout.clear();
    return response;
  } catch (error) {
    timeout.clear();
    
    // Se for abort (timeout), lança erro específico
    if (error.name === 'AbortError') {
      throw new RequestTimeoutError(url, REQUEST_CONFIG.timeout);
    }
    
    // Se ainda tem tentativas, espera e tenta novamente
    if (retries > 0) {
      console.warn(`[Jira API] Tentativa falhou, restam ${retries} tentativas. Erro: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, REQUEST_CONFIG.retryDelay));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    throw error;
  }
};

/**
 * Processa a resposta da API e trata erros.
 * 
 * @private
 * @async
 * @param {Response} response - Objeto Response do fetch
 * @param {string} endpoint - Endpoint para contexto de erro
 * @returns {Promise<Object>} Dados parseados da resposta
 * @throws {JiraApiError} Se a resposta indicar erro
 */
const processResponse = async (response, endpoint) => {
  if (!response.ok) {
    let errorDetails = null;
    
    try {
      const errorBody = await response.text();
      errorDetails = JSON.parse(errorBody);
    } catch {
      // Ignora erro de parse
    }
    
    const errorMessage = errorDetails?.errorMessages?.join(', ') ||
                        errorDetails?.message ||
                        `Erro HTTP ${response.status}`;
    
    throw new JiraApiError(
      errorMessage,
      response.status,
      response.statusText,
      endpoint,
      errorDetails
    );
  }
  
  // Algumas respostas podem ser vazias (204 No Content)
  const text = await response.text();
  
  if (!text) {
    return null;
  }
  
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * Função base para realizar requisições à API.
 * 
 * @private
 * @async
 * @param {string} endpoint - Endpoint da API (sem base URL)
 * @param {Object} [options={}] - Opções adicionais para o fetch
 * @returns {Promise<Object>} Dados da resposta
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const data = await apiRequest('/tickets');
 * const user = await apiRequest('/user', { method: 'GET' });
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  console.debug(`[Jira API] ${options.method || 'GET'} ${endpoint}`);
  
  const fetchOptions = {
    method: 'GET',
    headers: { ...DEFAULT_HEADERS },
    ...options
  };
  
  const response = await fetchWithRetry(url, fetchOptions);
  return processResponse(response, endpoint);
};

// ============================================================================
// FUNÇÕES DE API - TICKETS
// ============================================================================

/**
 * Busca todos os tickets do projeto.
 * 
 * Retorna a lista completa de tickets, incluindo abertos e fechados,
 * ordenados por prioridade e data de criação.
 * 
 * @async
 * @function fetchMyTickets
 * @returns {Promise<Object>} Objeto contendo array de tickets e metadados
 * @returns {Array<Object>} return.issues - Array de tickets
 * @returns {number} return.total - Total de tickets encontrados
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * try {
 *   const result = await fetchMyTickets();
 *   console.log(`${result.total} tickets encontrados`);
 *   result.issues.forEach(ticket => {
 *     console.log(`${ticket.key}: ${ticket.fields.summary}`);
 *   });
 * } catch (error) {
 *   console.error('Falha ao buscar tickets:', error.message);
 * }
 */
export const fetchMyTickets = async () => {
  try {
    const data = await apiRequest('/tickets');
    
    // Normaliza resposta (pode vir como array direto ou objeto com issues)
    if (Array.isArray(data)) {
      return {
        issues: data,
        total: data.length,
        startAt: 0,
        maxResults: data.length
      };
    }
    
    return data;
  } catch (error) {
    console.error('[Jira API] Erro ao buscar tickets:', error);
    throw error;
  }
};

/**
 * Busca tickets atribuídos ao usuário autenticado.
 * 
 * @async
 * @function fetchAssignedTickets
 * @returns {Promise<Object>} Objeto com tickets atribuídos
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const assigned = await fetchAssignedTickets();
 */
export const fetchAssignedTickets = async () => {
  try {
    return await apiRequest('/tickets/assigned');
  } catch (error) {
    console.error('[Jira API] Erro ao buscar tickets atribuídos:', error);
    throw error;
  }
};

/**
 * Busca tickets reportados pelo usuário autenticado.
 * 
 * @async
 * @function fetchReportedTickets
 * @returns {Promise<Object>} Objeto com tickets reportados
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchReportedTickets = async () => {
  try {
    return await apiRequest('/tickets/reported');
  } catch (error) {
    console.error('[Jira API] Erro ao buscar tickets reportados:', error);
    throw error;
  }
};

/**
 * Busca tickets de um usuário específico por email ou accountId.
 * 
 * @async
 * @function fetchUserTickets
 * @param {string} userIdentifier - Email ou accountId do usuário
 * @returns {Promise<Object>} Objeto com tickets do usuário
 * @throws {JiraApiError} Se a requisição falhar
 * @throws {Error} Se userIdentifier não for fornecido
 * 
 * @example
 * // Por email
 * const tickets = await fetchUserTickets('user@example.com');
 * 
 * // Por accountId
 * const tickets = await fetchUserTickets('5b10a2844c20165700ede21g');
 */
export const fetchUserTickets = async (userIdentifier) => {
  if (!userIdentifier) {
    throw new Error('Identificador do usuário é obrigatório');
  }
  
  try {
    const encodedIdentifier = encodeURIComponent(userIdentifier);
    return await apiRequest(`/tickets/user/${encodedIdentifier}`);
  } catch (error) {
    console.error(`[Jira API] Erro ao buscar tickets do usuário ${userIdentifier}:`, error);
    throw error;
  }
};

/**
 * Busca detalhes completos de um ticket específico.
 * 
 * Retorna informações detalhadas incluindo descrição completa,
 * comentários, anexos, histórico e metadados.
 * 
 * @async
 * @function fetchTicketDetails
 * @param {string} ticketKey - Chave do ticket (ex: "SUP-123")
 * @returns {Promise<Object>} Dados completos do ticket
 * @throws {JiraApiError} Se a requisição falhar
 * @throws {Error} Se ticketKey não for fornecido
 * 
 * @example
 * const details = await fetchTicketDetails('SUP-123');
 * console.log('Descrição:', extractTextFromADF(details.fields.description));
 * console.log('Comentários:', details.fields.comment.comments.length);
 */
export const fetchTicketDetails = async (ticketKey) => {
  if (!ticketKey) {
    throw new Error('Chave do ticket é obrigatória');
  }
  
  try {
    return await apiRequest(`/tickets/${encodeURIComponent(ticketKey)}`);
  } catch (error) {
    console.error(`[Jira API] Erro ao buscar detalhes do ticket ${ticketKey}:`, error);
    throw error;
  }
};

/**
 * Realiza busca avançada de tickets usando JQL.
 * 
 * @async
 * @function searchTickets
 * @param {Object} searchParams - Parâmetros de busca
 * @param {string} searchParams.jql - Query JQL
 * @param {string[]} [searchParams.fields] - Campos a retornar
 * @param {string[]} [searchParams.expand] - Campos a expandir
 * @param {number} [searchParams.startAt=0] - Índice inicial
 * @param {number} [searchParams.maxResults=50] - Máximo de resultados
 * @returns {Promise<Object>} Resultado da busca
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const result = await searchTickets({
 *   jql: 'project = SUP AND status = "In Progress"',
 *   fields: ['summary', 'status', 'assignee'],
 *   maxResults: 20
 * });
 */
export const searchTickets = async (searchParams) => {
  if (!searchParams?.jql) {
    throw new Error('JQL é obrigatório para busca');
  }
  
  try {
    return await apiRequest('/tickets/search', {
      method: 'POST',
      body: JSON.stringify(searchParams)
    });
  } catch (error) {
    console.error('[Jira API] Erro na busca de tickets:', error);
    throw error;
  }
};

// ============================================================================
// FUNÇÕES DE API - USUÁRIO
// ============================================================================

/**
 * Busca informações do usuário autenticado.
 * 
 * @async
 * @function fetchCurrentUser
 * @returns {Promise<Object>} Dados do usuário
 * @returns {string} return.accountId - ID único da conta
 * @returns {string} return.displayName - Nome de exibição
 * @returns {string} return.emailAddress - Email do usuário
 * @returns {Object} return.avatarUrls - URLs dos avatares
 * @returns {boolean} return.active - Se a conta está ativa
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const user = await fetchCurrentUser();
 * console.log(`Olá, ${user.displayName}!`);
 */
export const fetchCurrentUser = async () => {
  try {
    return await apiRequest('/user');
  } catch (error) {
    console.error('[Jira API] Erro ao buscar usuário atual:', error);
    throw error;
  }
};

/**
 * Busca usuários com base em uma query de texto.
 * 
 * @async
 * @function searchUsers
 * @param {string} query - Texto para busca (nome, email, etc)
 * @param {number} [maxResults=10] - Máximo de resultados
 * @returns {Promise<Array<Object>>} Lista de usuários encontrados
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const users = await searchUsers('john');
 */
export const searchUsers = async (query, maxResults = 10) => {
  try {
    const params = new URLSearchParams({
      query: query || '',
      maxResults: maxResults.toString()
    });
    
    return await apiRequest(`/user/search?${params.toString()}`);
  } catch (error) {
    console.error('[Jira API] Erro na busca de usuários:', error);
    throw error;
  }
};

// ============================================================================
// FUNÇÕES DE API - PROJETOS
// ============================================================================

/**
 * Busca lista de projetos acessíveis.
 * 
 * @async
 * @function fetchProjects
 * @returns {Promise<Object>} Lista de projetos
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const projects = await fetchProjects();
 * projects.values.forEach(p => console.log(p.name));
 */
export const fetchProjects = async () => {
  try {
    return await apiRequest('/projects');
  } catch (error) {
    console.error('[Jira API] Erro ao buscar projetos:', error);
    throw error;
  }
};

/**
 * Busca detalhes de um projeto específico.
 * 
 * @async
 * @function fetchProjectDetails
 * @param {string} projectIdOrKey - ID ou chave do projeto
 * @returns {Promise<Object>} Detalhes do projeto
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchProjectDetails = async (projectIdOrKey) => {
  if (!projectIdOrKey) {
    throw new Error('ID ou chave do projeto é obrigatório');
  }
  
  try {
    return await apiRequest(`/projects/${encodeURIComponent(projectIdOrKey)}`);
  } catch (error) {
    console.error(`[Jira API] Erro ao buscar projeto ${projectIdOrKey}:`, error);
    throw error;
  }
};

/**
 * Busca tipos de issue disponíveis para um projeto.
 * 
 * @async
 * @function fetchProjectIssueTypes
 * @param {string} projectIdOrKey - ID ou chave do projeto
 * @returns {Promise<Array<Object>>} Lista de tipos de issue
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchProjectIssueTypes = async (projectIdOrKey) => {
  if (!projectIdOrKey) {
    throw new Error('ID ou chave do projeto é obrigatório');
  }
  
  try {
    return await apiRequest(`/projects/${encodeURIComponent(projectIdOrKey)}/issuetypes`);
  } catch (error) {
    console.error(`[Jira API] Erro ao buscar tipos de issue do projeto ${projectIdOrKey}:`, error);
    throw error;
  }
};

// ============================================================================
// FUNÇÕES DE API - ISSUES (CRUD)
// ============================================================================

/**
 * Cria uma nova issue no Jira.
 * 
 * @async
 * @function createIssue
 * @param {Object} issueData - Dados da issue a criar
 * @param {Object} issueData.fields - Campos da issue
 * @param {Object|string} issueData.fields.project - Projeto (id ou key)
 * @param {Object|string} issueData.fields.issuetype - Tipo de issue
 * @param {string} issueData.fields.summary - Título/resumo
 * @param {string|Object} [issueData.fields.description] - Descrição
 * @param {Object|string} [issueData.fields.priority] - Prioridade
 * @param {string[]} [issueData.fields.labels] - Labels
 * @returns {Promise<Object>} Issue criada
 * @returns {string} return.id - ID da nova issue
 * @returns {string} return.key - Chave da nova issue
 * @returns {string} return.self - URL da issue na API
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const newIssue = await createIssue({
 *   fields: {
 *     project: { key: 'SUP' },
 *     issuetype: { name: 'Task' },
 *     summary: 'Nova tarefa',
 *     description: 'Descrição detalhada',
 *     priority: { name: 'Medium' }
 *   }
 * });
 * console.log(`Criado: ${newIssue.key}`);
 */
export const createIssue = async (issueData) => {
  if (!issueData?.fields) {
    throw new Error('Dados da issue são obrigatórios');
  }
  
  const { project, issuetype, summary } = issueData.fields;
  
  if (!project) {
    throw new Error('Projeto é obrigatório');
  }
  
  if (!issuetype) {
    throw new Error('Tipo de issue é obrigatório');
  }
  
  if (!summary?.trim()) {
    throw new Error('Resumo/título é obrigatório');
  }
  
  try {
    return await apiRequest('/issues', {
      method: 'POST',
      body: JSON.stringify(issueData)
    });
  } catch (error) {
    console.error('[Jira API] Erro ao criar issue:', error);
    throw error;
  }
};

/**
 * Atualiza uma issue existente.
 * 
 * @async
 * @function updateIssue
 * @param {string} issueIdOrKey - ID ou chave da issue
 * @param {Object} updateData - Dados para atualização
 * @param {Object} [updateData.fields] - Campos a atualizar
 * @param {Object} [updateData.update] - Operações de atualização
 * @returns {Promise<void>} Resolve quando atualizado com sucesso
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * await updateIssue('SUP-123', {
 *   fields: {
 *     summary: 'Título atualizado',
 *     priority: { name: 'High' }
 *   }
 * });
 */
export const updateIssue = async (issueIdOrKey, updateData) => {
  if (!issueIdOrKey) {
    throw new Error('ID ou chave da issue é obrigatório');
  }
  
  try {
    await apiRequest(`/issues/${encodeURIComponent(issueIdOrKey)}`, {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
  } catch (error) {
    console.error(`[Jira API] Erro ao atualizar issue ${issueIdOrKey}:`, error);
    throw error;
  }
};

/**
 * Remove uma issue.
 * 
 * @async
 * @function deleteIssue
 * @param {string} issueIdOrKey - ID ou chave da issue
 * @param {boolean} [deleteSubtasks=false] - Se deve deletar subtasks
 * @returns {Promise<void>} Resolve quando removido com sucesso
 * @throws {JiraApiError} Se a requisição falhar
 */
export const deleteIssue = async (issueIdOrKey, deleteSubtasks = false) => {
  if (!issueIdOrKey) {
    throw new Error('ID ou chave da issue é obrigatório');
  }
  
  try {
    await apiRequest(`/issues/${encodeURIComponent(issueIdOrKey)}?deleteSubtasks=${deleteSubtasks}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error(`[Jira API] Erro ao deletar issue ${issueIdOrKey}:`, error);
    throw error;
  }
};

// ============================================================================
// FUNÇÕES DE API - TRANSIÇÕES
// ============================================================================

/**
 * Busca transições disponíveis para uma issue.
 * 
 * @async
 * @function fetchIssueTransitions
 * @param {string} issueIdOrKey - ID ou chave da issue
 * @returns {Promise<Object>} Lista de transições disponíveis
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * const { transitions } = await fetchIssueTransitions('SUP-123');
 * transitions.forEach(t => console.log(`${t.id}: ${t.name}`));
 */
export const fetchIssueTransitions = async (issueIdOrKey) => {
  if (!issueIdOrKey) {
    throw new Error('ID ou chave da issue é obrigatório');
  }
  
  try {
    return await apiRequest(`/issues/${encodeURIComponent(issueIdOrKey)}/transitions`);
  } catch (error) {
    console.error(`[Jira API] Erro ao buscar transições de ${issueIdOrKey}:`, error);
    throw error;
  }
};

/**
 * Executa uma transição em uma issue.
 * 
 * @async
 * @function transitionIssue
 * @param {string} issueIdOrKey - ID ou chave da issue
 * @param {string} transitionId - ID da transição a executar
 * @param {Object} [additionalData={}] - Dados adicionais (campos, comentário)
 * @returns {Promise<void>} Resolve quando a transição for executada
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * // Mover para "In Progress"
 * await transitionIssue('SUP-123', '21');
 * 
 * // Com campos adicionais
 * await transitionIssue('SUP-123', '31', {
 *   fields: { resolution: { name: 'Done' } }
 * });
 */
export const transitionIssue = async (issueIdOrKey, transitionId, additionalData = {}) => {
  if (!issueIdOrKey) {
    throw new Error('ID ou chave da issue é obrigatório');
  }
  
  if (!transitionId) {
    throw new Error('ID da transição é obrigatório');
  }
  
  try {
    await apiRequest(`/issues/${encodeURIComponent(issueIdOrKey)}/transitions`, {
      method: 'POST',
      body: JSON.stringify({
        transition: { id: transitionId },
        ...additionalData
      })
    });
  } catch (error) {
    console.error(`[Jira API] Erro ao executar transição em ${issueIdOrKey}:`, error);
    throw error;
  }
};

// ============================================================================
// FUNÇÕES DE API - COMENTÁRIOS
// ============================================================================

/**
 * Busca comentários de uma issue.
 * 
 * @async
 * @function fetchIssueComments
 * @param {string} issueIdOrKey - ID ou chave da issue
 * @param {Object} [options={}] - Opções de busca
 * @param {number} [options.startAt=0] - Índice inicial
 * @param {number} [options.maxResults=50] - Máximo de resultados
 * @param {string} [options.orderBy='-created'] - Ordenação
 * @returns {Promise<Object>} Lista de comentários
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchIssueComments = async (issueIdOrKey, options = {}) => {
  if (!issueIdOrKey) {
    throw new Error('ID ou chave da issue é obrigatório');
  }
  
  const { startAt = 0, maxResults = 50, orderBy = '-created' } = options;
  
  try {
    const params = new URLSearchParams({
      startAt: startAt.toString(),
      maxResults: maxResults.toString(),
      orderBy
    });
    
    return await apiRequest(`/issues/${encodeURIComponent(issueIdOrKey)}/comments?${params.toString()}`);
  } catch (error) {
    console.error(`[Jira API] Erro ao buscar comentários de ${issueIdOrKey}:`, error);
    throw error;
  }
};

/**
 * Adiciona um comentário a uma issue.
 * 
 * @async
 * @function addComment
 * @param {string} issueIdOrKey - ID ou chave da issue
 * @param {string|Object} body - Conteúdo do comentário (texto ou ADF)
 * @param {Object} [visibility=null] - Restrição de visibilidade
 * @returns {Promise<Object>} Comentário criado
 * @throws {JiraApiError} Se a requisição falhar
 * 
 * @example
 * // Comentário simples
 * await addComment('SUP-123', 'Este é um comentário');
 * 
 * // Comentário interno (só para agentes)
 * await addComment('SUP-123', 'Nota interna', {
 *   type: 'role',
 *   value: 'Administrators'
 * });
 */
export const addComment = async (issueIdOrKey, body, visibility = null) => {
  if (!issueIdOrKey) {
    throw new Error('ID ou chave da issue é obrigatório');
  }
  
  if (!body) {
    throw new Error('Conteúdo do comentário é obrigatório');
  }
  
  try {
    const payload = { body };
    if (visibility) {
      payload.visibility = visibility;
    }
    
    return await apiRequest(`/issues/${encodeURIComponent(issueIdOrKey)}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`[Jira API] Erro ao adicionar comentário em ${issueIdOrKey}:`, error);
    throw error;
  }
};

// ============================================================================
// FUNÇÕES DE API - METADADOS
// ============================================================================

/**
 * Busca todas as prioridades disponíveis.
 * 
 * @async
 * @function fetchPriorities
 * @returns {Promise<Array<Object>>} Lista de prioridades
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchPriorities = async () => {
  try {
    return await apiRequest('/priority');
  } catch (error) {
    console.error('[Jira API] Erro ao buscar prioridades:', error);
    throw error;
  }
};

/**
 * Busca todos os tipos de issue.
 * 
 * @async
 * @function fetchIssueTypes
 * @returns {Promise<Array<Object>>} Lista de tipos de issue
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchIssueTypes = async () => {
  try {
    return await apiRequest('/issuetype');
  } catch (error) {
    console.error('[Jira API] Erro ao buscar tipos de issue:', error);
    throw error;
  }
};

/**
 * Busca metadados para criação de issues.
 * 
 * @async
 * @function fetchCreateMeta
 * @param {Object} [options={}] - Opções de busca
 * @param {string} [options.projectKeys] - Chaves de projetos
 * @param {string} [options.projectIds] - IDs de projetos
 * @returns {Promise<Object>} Metadados de criação
 * @throws {JiraApiError} Se a requisição falhar
 */
export const fetchCreateMeta = async (options = {}) => {
  try {
    const params = new URLSearchParams();
    
    if (options.projectKeys) params.append('projectKeys', options.projectKeys);
    if (options.projectIds) params.append('projectIds', options.projectIds);
    params.append('expand', 'projects.issuetypes.fields');
    
    return await apiRequest(`/issue/createmeta?${params.toString()}`);
  } catch (error) {
    console.error('[Jira API] Erro ao buscar metadados de criação:', error);
    throw error;
  }
};

// ============================================================================
// UTILITÁRIOS - FORMATAÇÃO DE DATAS
// ============================================================================

/**
 * Formata uma data para exibição (apenas data).
 * 
 * @function formatDate
 * @param {string|Date} dateInput - Data a ser formatada (ISO string ou Date)
 * @param {Object} [options={}] - Opções de formatação
 * @param {string} [options.locale] - Locale para formatação
 * @returns {string} Data formatada ou string vazia se inválida
 * 
 * @example
 * formatDate('2024-01-15T10:30:00.000Z');
 * // Retorna: "15 de jan. de 2024"
 * 
 * formatDate(new Date());
 * // Retorna: "20 de jan. de 2024"
 */
export const formatDate = (dateInput, options = {}) => {
  if (!dateInput) return '';
  
  try {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    
    if (isNaN(date.getTime())) {
      console.warn('[formatDate] Data inválida:', dateInput);
      return '';
    }
    
    const locale = options.locale || LOCALE_CONFIG.locale;
    
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('[formatDate] Erro ao formatar data:', error);
    return '';
  }
};

/**
 * Formata uma data com hora para exibição.
 * 
 * @function formatDateTime
 * @param {string|Date} dateInput - Data a ser formatada
 * @param {Object} [options={}] - Opções de formatação
 * @param {string} [options.locale] - Locale para formatação
 * @param {boolean} [options.includeSeconds=false] - Incluir segundos
 * @returns {string} Data e hora formatadas ou string vazia se inválida
 * 
 * @example
 * formatDateTime('2024-01-15T10:30:00.000Z');
 * // Retorna: "15 de jan. de 2024, 10:30"
 */
export const formatDateTime = (dateInput, options = {}) => {
  if (!dateInput) return '';
  
  try {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    
    if (isNaN(date.getTime())) {
      console.warn('[formatDateTime] Data inválida:', dateInput);
      return '';
    }
    
    const locale = options.locale || LOCALE_CONFIG.locale;
    
    const formatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    if (options.includeSeconds) {
      formatOptions.second = '2-digit';
    }
    
    return date.toLocaleDateString(locale, formatOptions);
  } catch (error) {
    console.error('[formatDateTime] Erro ao formatar data/hora:', error);
    return '';
  }
};

/**
 * Formata uma data de forma relativa (ex: "há 2 dias").
 * 
 * @function formatRelativeDate
 * @param {string|Date} dateInput - Data a ser formatada
 * @param {Object} [options={}] - Opções de formatação
 * @param {string} [options.locale] - Locale para formatação
 * @returns {string} Data relativa formatada
 * 
 * @example
 * formatRelativeDate('2024-01-13T10:30:00.000Z');
 * // Retorna: "há 2 dias"
 */
export const formatRelativeDate = (dateInput, options = {}) => {
  if (!dateInput) return '';
  
  try {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    
    if (isNaN(date.getTime())) {
      return '';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);
    
    // Decide o formato baseado na diferença
    if (diffSec < 60) {
      return 'agora mesmo';
    } else if (diffMin < 60) {
      return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    } else if (diffHour < 24) {
      return `há ${diffHour} ${diffHour === 1 ? 'hora' : 'horas'}`;
    } else if (diffDay < 7) {
      return `há ${diffDay} ${diffDay === 1 ? 'dia' : 'dias'}`;
    } else if (diffWeek < 4) {
      return `há ${diffWeek} ${diffWeek === 1 ? 'semana' : 'semanas'}`;
    } else if (diffMonth < 12) {
      return `há ${diffMonth} ${diffMonth === 1 ? 'mês' : 'meses'}`;
    } else {
      return `há ${diffYear} ${diffYear === 1 ? 'ano' : 'anos'}`;
    }
  } catch (error) {
    console.error('[formatRelativeDate] Erro:', error);
    return '';
  }
};

// ============================================================================
// UTILITÁRIOS - ATLASSIAN DOCUMENT FORMAT (ADF)
// ============================================================================

/**
 * Extrai texto plano de um documento ADF (Atlassian Document Format).
 * 
 * O ADF é o formato de documento estruturado usado pelo Jira para
 * campos de texto rico como descrição e comentários.
 * 
 * @function extractTextFromADF
 * @param {string|Object} adfContent - Conteúdo ADF ou string simples
 * @returns {string} Texto extraído formatado
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/}
 * 
 * @example
 * // Com documento ADF
 * const adf = {
 *   type: 'doc',
 *   version: 1,
 *   content: [
 *     {
 *       type: 'paragraph',
 *       content: [{ type: 'text', text: 'Hello World' }]
 *     }
 *   ]
 * };
 * extractTextFromADF(adf); // "Hello World\n"
 * 
 * // Com string simples
 * extractTextFromADF('Plain text'); // "Plain text"
 */
export const extractTextFromADF = (adfContent) => {
  // Retorna vazio se não houver conteúdo
  if (!adfContent) {
    return '';
  }
  
  // Se for string simples, retorna diretamente
  if (typeof adfContent === 'string') {
    return adfContent;
  }
  
  // Se for documento ADF, extrai o texto
  if (adfContent.type === 'doc' && adfContent.content) {
    return extractContentText(adfContent.content);
  }
  
  // Tenta extrair se for um array de nodes
  if (Array.isArray(adfContent)) {
    return extractContentText(adfContent);
  }
  
  return '';
};

/**
 * Função auxiliar recursiva para extrair texto de nodes ADF.
 * 
 * @private
 * @function extractContentText
 * @param {Array<Object>} content - Array de nodes ADF
 * @param {number} [depth=0] - Profundidade atual (para limitar recursão)
 * @returns {string} Texto extraído
 */
const extractContentText = (content, depth = 0) => {
  // Proteção contra recursão infinita
  if (depth > 20 || !Array.isArray(content)) {
    return '';
  }
  
  let text = '';
  
  for (const node of content) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    
    switch (node.type) {
      case 'text':
        text += node.text || '';
        break;
        
      case 'hardBreak':
        text += '\n';
        break;
        
      case 'paragraph':
        if (node.content) {
          text += extractContentText(node.content, depth + 1);
        }
        text += '\n';
        break;
        
      case 'heading':
        if (node.content) {
          const headingText = extractContentText(node.content, depth + 1);
          const level = node.attrs?.level || 1;
          text += `${'#'.repeat(level)} ${headingText}\n`;
        }
        break;
        
      case 'bulletList':
        if (node.content) {
          for (const listItem of node.content) {
            if (listItem.type === 'listItem' && listItem.content) {
              text += '• ' + extractContentText(listItem.content, depth + 1).trim() + '\n';
            }
          }
        }
        break;
        
      case 'orderedList':
        if (node.content) {
          let index = node.attrs?.order || 1;
          for (const listItem of node.content) {
            if (listItem.type === 'listItem' && listItem.content) {
              text += `${index}. ` + extractContentText(listItem.content, depth + 1).trim() + '\n';
              index++;
            }
          }
        }
        break;
        
      case 'codeBlock':
        const language = node.attrs?.language || '';
        text += '```' + language + '\n';
        if (node.content) {
          text += extractContentText(node.content, depth + 1);
        }
        text += '\n```\n';
        break;
        
      case 'blockquote':
        if (node.content) {
          const quoteLines = extractContentText(node.content, depth + 1)
            .split('\n')
            .filter(line => line)
            .map(line => '> ' + line)
            .join('\n');
          text += quoteLines + '\n';
        }
        break;
        
      case 'rule':
        text += '\n---\n';
        break;
        
      case 'table':
        if (node.content) {
          for (const row of node.content) {
            if (row.type === 'tableRow' && row.content) {
              const cells = row.content.map(cell => {
                if (cell.content) {
                  return extractContentText(cell.content, depth + 1).trim();
                }
                return '';
              });
              text += '| ' + cells.join(' | ') + ' |\n';
            }
          }
        }
        break;
        
      case 'mention':
        // Menções de usuário
        const mentionText = node.attrs?.text || node.attrs?.id || '@usuário';
        text += mentionText;
        break;
        
      case 'emoji':
        // Emojis
        const emoji = node.attrs?.shortName || node.attrs?.text || '';
        text += emoji;
        break;
        
      case 'inlineCard':
      case 'blockCard':
        // Links/cards
        const url = node.attrs?.url || '';
        text += url ? `[Link](${url})` : '';
        break;
        
      case 'mediaSingle':
      case 'media':
        // Mídia/anexos
        text += '[Anexo]';
        break;
        
      default:
        // Para outros tipos, tenta extrair conteúdo recursivamente
        if (node.content) {
          text += extractContentText(node.content, depth + 1);
        }
    }
  }
  
  return text;
};

/**
 * Converte texto plano para formato ADF básico.
 * 
 * @function textToADF
 * @param {string} text - Texto a ser convertido
 * @returns {Object} Documento ADF
 * 
 * @example
 * const adf = textToADF('Olá mundo!\n\nSegundo parágrafo');
 * // Retorna documento ADF estruturado
 */
export const textToADF = (text) => {
  if (!text) {
    return {
      type: 'doc',
      version: 1,
      content: []
    };
  }
  
  // Divide em parágrafos
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  
  const content = paragraphs.map(paragraph => {
    // Divide linhas dentro do parágrafo
    const lines = paragraph.split('\n');
    const paragraphContent = [];
    
    lines.forEach((line, index) => {
      if (line) {
        paragraphContent.push({ type: 'text', text: line });
      }
      // Adiciona hardBreak entre linhas (exceto na última)
      if (index < lines.length - 1) {
        paragraphContent.push({ type: 'hardBreak' });
      }
    });
    
    return {
      type: 'paragraph',
      content: paragraphContent
    };
  });
  
  return {
    type: 'doc',
    version: 1,
    content
  };
};

// ============================================================================
// UTILITÁRIOS - PRIORIDADES
// ============================================================================

/**
 * Obtém a classe CSS correspondente à prioridade.
 * 
 * @function getPriorityColorClass
 * @param {Object|string} priority - Objeto de prioridade ou nome
 * @returns {string} Classe CSS para a prioridade
 * 
 * @example
 * getPriorityColorClass({ name: 'High' });
 * // Retorna: "ticket-priority-high"
 * 
 * getPriorityColorClass('Medium');
 * // Retorna: "ticket-priority-medium"
 */
export const getPriorityColorClass = (priority) => {
  const defaultClass = 'ticket-priority-medium';
  
  if (!priority) {
    return defaultClass;
  }
  
  const priorityName = typeof priority === 'string' 
    ? priority.toLowerCase() 
    : priority.name?.toLowerCase();
  
  if (!priorityName) {
    return defaultClass;
  }
  
  return PRIORITY_MAP[priorityName]?.className || defaultClass;
};

/**
 * Obtém informações completas da prioridade.
 * 
 * @function getPriorityInfo
 * @param {Object|string} priority - Objeto de prioridade ou nome
 * @returns {Object} Informações da prioridade (className, color, label, weight)
 * 
 * @example
 * const info = getPriorityInfo('High');
 * // Retorna: { className: 'ticket-priority-high', color: '#e85d04', label: 'Alta', weight: 2 }
 */
export const getPriorityInfo = (priority) => {
  const defaultInfo = PRIORITY_MAP.medium;
  
  if (!priority) {
    return defaultInfo;
  }
  
  const priorityName = typeof priority === 'string'
    ? priority.toLowerCase()
    : priority.name?.toLowerCase();
  
  return PRIORITY_MAP[priorityName] || defaultInfo;
};

/**
 * Ordena tickets por prioridade (mais urgente primeiro).
 * 
 * @function sortByPriority
 * @param {Array<Object>} tickets - Array de tickets
 * @returns {Array<Object>} Tickets ordenados por prioridade
 * 
 * @example
 * const sorted = sortByPriority(tickets);
 */
export const sortByPriority = (tickets) => {
  if (!Array.isArray(tickets)) {
    return [];
  }
  
  return [...tickets].sort((a, b) => {
    const priorityA = getPriorityInfo(a.fields?.priority).weight;
    const priorityB = getPriorityInfo(b.fields?.priority).weight;
    return priorityA - priorityB;
  });
};

// ============================================================================
// UTILITÁRIOS - COMENTÁRIOS
// ============================================================================

/**
 * Verifica se um comentário é interno (visível apenas para agentes/admins).
 * 
 * Comentários internos são identificados por restrições de visibilidade
 * baseadas em roles ou grupos específicos do Jira Service Desk.
 * 
 * @function isInternalComment
 * @param {Object} comment - Objeto de comentário do Jira
 * @returns {boolean} True se for comentário interno
 * 
 * @example
 * const comment = {
 *   body: 'Nota interna',
 *   visibility: { type: 'role', value: 'Administrators' }
 * };
 * isInternalComment(comment); // true
 */
export const isInternalComment = (comment) => {
  if (!comment?.visibility) {
    return false;
  }
  
  const { type, value } = comment.visibility;
  
  if (!type || !value) {
    return false;
  }
  
  const normalizedValue = value.toLowerCase();
  
  if (type === 'role') {
    return INTERNAL_VISIBILITY.roles.some(role => 
      normalizedValue.includes(role.toLowerCase())
    );
  }
  
  if (type === 'group') {
    return INTERNAL_VISIBILITY.groups.some(group => 
      normalizedValue.includes(group.toLowerCase())
    );
  }
  
  return false;
};

/**
 * Retorna o tipo de comentário para exibição.
 * 
 * @function getCommentType
 * @param {Object} comment - Objeto de comentário
 * @returns {'internal'|'customer'} Tipo do comentário
 * 
 * @example
 * getCommentType(comment); // 'internal' ou 'customer'
 */
export const getCommentType = (comment) => {
  return isInternalComment(comment) ? 'internal' : 'customer';
};

/**
 * Separa comentários por tipo (interno vs cliente).
 * 
 * @function separateComments
 * @param {Array<Object>} comments - Array de comentários
 * @returns {Object} Objeto com arrays separados
 * @returns {Array<Object>} return.internal - Comentários internos
 * @returns {Array<Object>} return.customer - Comentários de cliente
 * @returns {Array<Object>} return.all - Todos os comentários ordenados
 * 
 * @example
 * const { internal, customer } = separateComments(comments);
 * console.log(`${internal.length} internos, ${customer.length} de clientes`);
 */
export const separateComments = (comments) => {
  const result = {
    internal: [],
    customer: [],
    all: []
  };
  
  if (!Array.isArray(comments)) {
    return result;
  }
  
  for (const comment of comments) {
    if (isInternalComment(comment)) {
      result.internal.push(comment);
    } else {
      result.customer.push(comment);
    }
    result.all.push(comment);
  }
  
  // Ordena todos por data de criação (mais recente primeiro)
  result.all.sort((a, b) => new Date(b.created) - new Date(a.created));
  
  return result;
};

/**
 * Processa comentários adicionando metadados úteis.
 * 
 * @function processComments
 * @param {Array<Object>} comments - Array de comentários brutos
 * @returns {Array<Object>} Comentários processados com metadados
 * 
 * @example
 * const processed = processComments(ticket.fields.comment.comments);
 * processed.forEach(c => {
 *   console.log(`${c.type}: ${c.plainTextBody} (${c.relativeDate})`);
 * });
 */
export const processComments = (comments) => {
  if (!Array.isArray(comments)) {
    return [];
  }
  
  return comments.map(comment => ({
    ...comment,
    type: getCommentType(comment),
    isInternal: isInternalComment(comment),
    plainTextBody: extractTextFromADF(comment.body),
    formattedDate: formatDateTime(comment.created),
    relativeDate: formatRelativeDate(comment.created),
    authorName: comment.author?.displayName || 'Desconhecido',
    authorAvatar: comment.author?.avatarUrls?.['24x24'] || null
  }));
};

// ============================================================================
// UTILITÁRIOS - VALIDAÇÃO
// ============================================================================

/**
 * Valida se uma string é uma chave de ticket válida.
 * 
 * @function isValidTicketKey
 * @param {string} key - Chave a validar
 * @returns {boolean} True se for válida
 * 
 * @example
 * isValidTicketKey('SUP-123');  // true
 * isValidTicketKey('SUP123');   // false
 * isValidTicketKey('');         // false
 */
export const isValidTicketKey = (key) => {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // Formato: PROJECT-NUMBER (ex: SUP-123, PROJ-1)
  const ticketKeyRegex = /^[A-Z][A-Z0-9]+-\d+$/;
  return ticketKeyRegex.test(key.toUpperCase());
};

/**
 * Valida se um email é válido.
 * 
 * @function isValidEmail
 * @param {string} email - Email a validar
 * @returns {boolean} True se for válido
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// ============================================================================
// UTILITÁRIOS - URLs
// ============================================================================

/**
 * Gera a URL de um ticket no Jira.
 * 
 * @function getTicketUrl
 * @param {string} ticketKey - Chave do ticket
 * @returns {string} URL completa do ticket
 * 
 * @example
 * getTicketUrl('SUP-123');
 * // Retorna: "https://your-domain.atlassian.net/browse/SUP-123"
 */
export const getTicketUrl = (ticketKey) => {
  const domain = process.env.REACT_APP_JIRA_DOMAIN;
  return `https://${domain}/browse/${ticketKey}`;
};

/**
 * Gera a URL da API para um recurso.
 * 
 * @function getApiUrl
 * @param {string} endpoint - Endpoint da API
 * @returns {string} URL completa da API
 */
export const getApiUrl = (endpoint) => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${cleanEndpoint}`;
};

// ============================================================================
// EXPORTS ADICIONAIS
// ============================================================================

/**
 * Exporta a classe de erro para uso externo.
 */
export { JiraApiError, RequestTimeoutError };

/**
 * Exporta configurações para uso em testes ou customização.
 */
export {
  API_BASE_URL,
  REQUEST_CONFIG,
  PRIORITY_MAP,
  INTERNAL_VISIBILITY,
  LOCALE_CONFIG
};

/**
 * Objeto com todas as funções de API agrupadas.
 * Útil para injeção de dependência ou mocking em testes.
 * 
 * @example
 * import { api } from './api/jira';
 * 
 * // Em produção
 * const tickets = await api.fetchMyTickets();
 * 
 * // Em testes (com mock)
 * jest.mock('./api/jira', () => ({
 *   api: {
 *     fetchMyTickets: jest.fn().mockResolvedValue([])
 *   }
 * }));
 */
export const api = {
  // Tickets
  fetchMyTickets,
  fetchAssignedTickets,
  fetchReportedTickets,
  fetchUserTickets,
  fetchTicketDetails,
  searchTickets,
  
  // Issues CRUD
  createIssue,
  updateIssue,
  deleteIssue,
  
  // Transições
  fetchIssueTransitions,
  transitionIssue,
  
  // Comentários
  fetchIssueComments,
  addComment,
  
  // Usuários
  fetchCurrentUser,
  searchUsers,
  
  // Projetos
  fetchProjects,
  fetchProjectDetails,
  fetchProjectIssueTypes,
  
  // Metadados
  fetchPriorities,
  fetchIssueTypes,
  fetchCreateMeta
};

/**
 * Objeto com todas as funções utilitárias agrupadas.
 * 
 * @example
 * import { utils } from './api/jira';
 * 
 * const formatted = utils.formatDate(ticket.fields.created);
 * const text = utils.extractTextFromADF(ticket.fields.description);
 */
export const utils = {
  // Datas
  formatDate,
  formatDateTime,
  formatRelativeDate,
  
  // ADF
  extractTextFromADF,
  textToADF,
  
  // Prioridades
  getPriorityColorClass,
  getPriorityInfo,
  sortByPriority,
  
  // Comentários
  isInternalComment,
  getCommentType,
  separateComments,
  processComments,
  
  // Validação
  isValidTicketKey,
  isValidEmail,
  
  // URLs
  getTicketUrl,
  getApiUrl
};