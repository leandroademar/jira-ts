/**
 * @fileoverview Servidor Express que atua como proxy para a API REST do Jira Cloud v3.
 * 
 * Este servidor fornece uma camada intermediária entre o cliente frontend e a API
 * do Jira, gerenciando autenticação, paginação e formatação de dados conforme
 * a especificação oficial da Atlassian REST API v3.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/}
 * 
 * @author Seu Nome
 * @version 2.0.0
 * @license MIT
 * 
 * @requires express - Framework web para Node.js
 * @requires cors - Middleware para habilitar CORS
 * @requires node-fetch - Cliente HTTP para fazer requisições
 * @requires dotenv - Carrega variáveis de ambiente do arquivo .env
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

/**
 * Instância principal do servidor Express.
 * @type {express.Application}
 */
const app = express();

/**
 * Porta em que o servidor irá escutar.
 * @type {number}
 */
const PORT = process.env.PORT || 3003;

/**
 * URL base para todas as requisições à API do Jira v3.
 * @type {string}
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#uri-structure}
 */
const JIRA_BASE_URL = `https://${process.env.REACT_APP_JIRA_DOMAIN}/rest/api/3`;

/**
 * Número máximo de resultados por página na API do Jira.
 * @constant {number}
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#pagination}
 */
const MAX_RESULTS_PER_PAGE = 100;

/**
 * Campos padrão para consultas de issues conforme API v3.
 * @constant {string[]}
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-get}
 */
const DEFAULT_ISSUE_FIELDS = [
  'summary',
  'status',
  'priority',
  'assignee',
  'reporter',
  'created',
  'updated',
  'issuetype',
  'project',
  'description',
  'comment',
  'labels',
  'resolution',
  'resolutiondate'
];

/**
 * Campos expandidos padrão nas consultas.
 * @constant {string[]}
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/#expansion}
 */
const DEFAULT_EXPAND = ['renderedFields', 'names', 'schema', 'operations', 'editmeta', 'changelog'];

// ============================================================================
// CONFIGURAÇÃO DE MIDDLEWARES
// ============================================================================

app.use(cors());
app.use(express.json());

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

/**
 * Gera os headers de autenticação para a API do Jira.
 * 
 * Utiliza autenticação Basic com email e API token conforme documentação:
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/}
 * 
 * @returns {Object} Headers HTTP para autenticação.
 * @throws {Error} Se as credenciais não estiverem configuradas.
 */
const getAuthHeaders = () => {
  const email = process.env.REACT_APP_JIRA_EMAIL;
  const apiToken = process.env.REACT_APP_JIRA_API_TOKEN;
  
  if (!email || !apiToken) {
    throw new Error(
      'Credenciais do Jira não encontradas. ' +
      'Configure REACT_APP_JIRA_EMAIL e REACT_APP_JIRA_API_TOKEN no arquivo .env'
    );
  }
  
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
  
  return {
    'Authorization': `Basic ${credentials}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
};

/**
 * Realiza uma requisição à API do Jira com tratamento de erros.
 * 
 * @async
 * @param {string} endpoint - Endpoint da API (sem a base URL).
 * @param {Object} [options={}] - Opções da requisição fetch.
 * @returns {Promise<Object>} Resposta da API parseada como JSON.
 * @throws {Error} Se a requisição falhar.
 */
const jiraRequest = async (endpoint, options = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${JIRA_BASE_URL}${endpoint}`;
  
  // Log para depuração de chamadas search
  if (endpoint.includes('search')) {
    console.log(`[jiraRequest] ${options.method || 'GET'} ${url}`);
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage;
    
    try {
      const errorJson = JSON.parse(errorBody);
      errorMessage = errorJson.errorMessages?.join(', ') || 
                    errorJson.message ||
                    JSON.stringify(errorJson.errors) ||
                    errorBody;
    } catch {
      errorMessage = errorBody;
    }
    
    const error = new Error(`Jira API Error: ${errorMessage}`);
    error.status = response.status;
    error.statusText = response.statusText;
    throw error;
  }
  
  // Algumas respostas podem ser vazias (204 No Content)
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

/**
 * Busca issues usando o endpoint de pesquisa com paginação automática.
 * 
 * Migrado para a nova API /search/jql que usa paginação por token.
 * 
 * @async
 * @param {Object} searchParams - Parâmetros de pesquisa.
 * @param {string} searchParams.jql - Query JQL.
 * @param {string[]} [searchParams.fields] - Campos a retornar.
 * @param {string[]} [searchParams.expand] - Campos a expandir.
 * @param {number} [searchParams.maxResults] - Máximo de resultados por página.
 * @param {boolean} [searchParams.fetchAll=true] - Se deve buscar todas as páginas.
 * 
 * @returns {Promise<Object>} Objeto com issues e metadados.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post}
 */
const searchIssues = async ({
  jql,
  fields = DEFAULT_ISSUE_FIELDS,
  expand = [],
  maxResults = MAX_RESULTS_PER_PAGE,
  fetchAll = true
}) => {
  let allIssues = [];
  let nextPageToken = undefined;
  let isLast = false;

  console.log(`[searchIssues] JQL: ${jql}`);

  while (!isLast) {
    // Nova API /search/jql usa paginação por token (nextPageToken)
    // Conforme documentação: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post
    const requestBody = {
      jql,
      maxResults
    };
    
    // Adicionar nextPageToken apenas se existir (não incluir na primeira requisição)
    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }
    
    // Adicionar fields apenas se fornecido e não vazio
    if (fields && Array.isArray(fields) && fields.length > 0) {
      requestBody.fields = fields;
    }
    
    // Adicionar expand apenas se fornecido e não vazio
    if (expand && Array.isArray(expand) && expand.length > 0) {
      requestBody.expand = expand;
    }

    try {
      console.log(`[searchIssues] Requesting page: maxResults=${maxResults}, hasNextToken=${!!nextPageToken}`);
      console.log(`[searchIssues] Request body:`, JSON.stringify(requestBody, null, 2));
      const data = await jiraRequest('/search/jql', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!data) {
        console.warn('[searchIssues] Empty response from Jira');
        isLast = true;
        break;
      }

      // A nova API retorna issues, isLast e nextPageToken
      const issues = data.issues || [];
      allIssues = allIssues.concat(issues);
      
      isLast = data.isLast === true;
      nextPageToken = data.nextPageToken;

      console.log(`[searchIssues] Progresso: ${allIssues.length} issues (isLast=${isLast})`);

      // Se não há mais issues e não há token, parar
      if (!fetchAll || (issues.length === 0 && !nextPageToken)) {
        isLast = true;
      }
    } catch (error) {
      console.error('[searchIssues] Error in jiraRequest:', error.message);
      console.error('[searchIssues] Error status:', error.status);
      throw error;
    }
  }

  return {
    issues: allIssues,
    total: allIssues.length,
    startAt: 0,
    maxResults: allIssues.length
  };
};

/**
 * Converte um email em formato de label válido para o Jira.
 * Labels podem conter apenas caracteres alfanuméricos, underscore e hífen.
 * 
 * @param {string} email - Email a converter.
 * @param {string} [prefix='req'] - Prefixo da label.
 * @returns {string} Label formatada.
 */
const emailToLabel = (email, prefix = 'req') => {
  const sanitized = email.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `${prefix}-${sanitized}`;
};

/**
 * Constrói um documento ADF (Atlassian Document Format) a partir de texto.
 * 
 * @param {string} text - Texto a ser convertido.
 * @returns {Object} Documento no formato ADF.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/}
 */
const buildAdfDocument = (text) => {
  if (!text) {
    return {
      type: 'doc',
      version: 1,
      content: []
    };
  }

  // Divide o texto em parágrafos
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map(paragraph => ({
      type: 'paragraph',
      content: paragraph.split('\n').map((line, index, array) => {
        const nodes = [{ type: 'text', text: line }];
        // Adiciona hardBreak entre linhas (exceto na última)
        if (index < array.length - 1) {
          nodes.push({ type: 'hardBreak' });
        }
        return nodes;
      }).flat()
    }))
  };
};

/**
 * Converte documento ADF para texto simples.
 * 
 * @param {Object} adfDocument - Documento ADF.
 * @returns {string} Texto extraído.
 */
const adfToPlainText = (adfDocument) => {
  if (!adfDocument || !adfDocument.content) {
    return '';
  }

  const extractText = (node) => {
    if (node.type === 'text') {
      return node.text || '';
    }
    if (node.type === 'hardBreak') {
      return '\n';
    }
    if (node.content) {
      return node.content.map(extractText).join('');
    }
    return '';
  };

  return adfDocument.content.map(extractText).join('\n\n');
};

// ============================================================================
// ROTAS DA API - MYSELF
// ============================================================================

/**
 * @route GET /api/user
 * @description Retorna detalhes do usuário autenticado.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-myself/#api-rest-api-3-myself-get}
 * 
 * @returns {Object} 200 - Dados do usuário.
 * @returns {Object} 401 - Não autenticado.
 */
app.get('/api/user', async (req, res) => {
  try {
    console.log('[GET /api/user] Buscando usuário autenticado');
    
    // Parâmetro expand para obter mais detalhes
    const expand = req.query.expand || 'groups,applicationRoles';
    const userData = await jiraRequest(`/myself?expand=${expand}`);
    
    console.log(`[GET /api/user] Usuário: ${userData.displayName} (${userData.accountId})`);
    res.json(userData);
  } catch (error) {
    console.error('[GET /api/user] Erro:', error.message);
    res.status(error.status || 500).json({ 
      error: error.message,
      status: error.status
    });
  }
});

// ============================================================================
// ROTAS DA API - ISSUE SEARCH
// ============================================================================

/**
 * @route GET /api/tickets
 * @description Busca issues usando JQL.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-get}
 * 
 * @query {string} [jql] - Query JQL personalizada.
 * @query {string} [project] - Filtrar por projeto.
 * @query {string} [status] - Filtrar por status.
 * @query {number} [maxResults] - Máximo de resultados.
 * @query {boolean} [fetchAll] - Buscar todas as páginas.
 * 
 * @returns {Object} 200 - Lista de issues.
 */
app.get('/api/tickets', async (req, res) => {
  try {
    const { 
      jql: customJql, 
      project = 'SUP', 
      status,
      maxResults,
      fetchAll = 'true'
    } = req.query;

    // Constrói JQL se não fornecido
    let jql = customJql;
    if (!jql) {
      const conditions = [];
      if (project) conditions.push(`project = "${project}"`);
      if (status) conditions.push(`status = "${status}"`);
      
      jql = conditions.length > 0 
        ? `${conditions.join(' AND ')} ORDER BY priority DESC, created DESC`
        : 'ORDER BY priority DESC, created DESC';
    }

    console.log(`[GET /api/tickets] JQL: ${jql}`);

    const result = await searchIssues({
      jql,
      maxResults: maxResults ? parseInt(maxResults) : MAX_RESULTS_PER_PAGE,
      fetchAll: fetchAll === 'true'
    });

    console.log(`[GET /api/tickets] Total: ${result.total} issues`);
    res.json(result);
  } catch (error) {
    console.error('[GET /api/tickets] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/tickets/assigned
 * @description Busca issues atribuídas ao usuário autenticado.
 * 
 * @query {string} [status] - Filtrar por status (padrão: exclui Done e Closed).
 * 
 * @returns {Object} 200 - Lista de issues atribuídas.
 */
app.get('/api/tickets/assigned', async (req, res) => {
  try {
    const { status } = req.query;
    
    // Usar currentUser() para referir ao usuário autenticado
    let jql = 'assignee = currentUser()';
    
    if (status) {
      jql += ` AND status = "${status}"`;
    } else {
      jql += ' AND status NOT IN (Done, Closed)';
    }
    
    jql += ' ORDER BY priority DESC, created DESC';

    console.log(`[GET /api/tickets/assigned] JQL: ${jql}`);

    const result = await searchIssues({ jql });

    console.log(`[GET /api/tickets/assigned] Total: ${result.total} issues`);
    res.json(result);
  } catch (error) {
    console.error('[GET /api/tickets/assigned] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/tickets/reported
 * @description Busca issues reportadas pelo usuário autenticado.
 * 
 * @returns {Object} 200 - Lista de issues reportadas.
 */
app.get('/api/tickets/reported', async (req, res) => {
  try {
    const jql = 'reporter = currentUser() ORDER BY created DESC';

    console.log(`[GET /api/tickets/reported] JQL: ${jql}`);

    const result = await searchIssues({ jql });

    console.log(`[GET /api/tickets/reported] Total: ${result.total} issues`);
    res.json(result);
  } catch (error) {
    console.error('[GET /api/tickets/reported] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/tickets/user/:userEmail
 * @description Busca issues por email do usuário (usando labels e description).
 * 
 * @param {string} userEmail - Email do usuário.
 * 
 * @returns {Object} 200 - Lista de issues do usuário.
 */
app.get('/api/tickets/user/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const decodedEmail = decodeURIComponent(userEmail);
    
    // Normalizar email para label
    const emailToLabel = (email) => {
      return email.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    };
    
    const safeEmail = emailToLabel(decodedEmail);
    const labelReq = `req-${safeEmail}`;
    const labelId = `id-${safeEmail}`;
    
    // Escapar aspas para JQL
    const escapedEmail = decodedEmail.replace(/"/g, '\\"');
    
    // Buscar por labels ou description
    const jql = `(labels = "${labelReq}" OR labels = "${labelId}" OR description ~ "Requested by: ${escapedEmail}") ORDER BY priority DESC, created DESC`;

    console.log(`[GET /api/tickets/user] Email: ${decodedEmail}, JQL: ${jql}`);

    const result = await searchIssues({
      jql,
      fields: [...DEFAULT_ISSUE_FIELDS, 'labels']
    });

    console.log(`[GET /api/tickets/user] Total: ${result.total} issues`);
    // Retornar apenas o array de issues para compatibilidade com o frontend
    res.json(result.issues || []);
  } catch (error) {
    console.error('[GET /api/tickets/user] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/tickets/user/:accountId/by-account
 * @description Busca issues por accountId do usuário Jira.
 * 
 * @param {string} accountId - Account ID do usuário Jira.
 * @query {string} [role] - 'assignee', 'reporter', ou 'any' (padrão).
 * 
 * @returns {Object} 200 - Lista de issues do usuário.
 */
app.get('/api/tickets/user/:accountId/by-account', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { role = 'any' } = req.query;
    
    const decodedAccountId = decodeURIComponent(accountId);
    
    let jql;
    switch (role) {
      case 'assignee':
        jql = `assignee = "${decodedAccountId}"`;
        break;
      case 'reporter':
        jql = `reporter = "${decodedAccountId}"`;
        break;
      default:
        jql = `assignee = "${decodedAccountId}" OR reporter = "${decodedAccountId}"`;
    }
    
    jql += ' ORDER BY updated DESC';

    console.log(`[GET /api/tickets/user/by-account] Account: ${decodedAccountId}, JQL: ${jql}`);

    const result = await searchIssues({
      jql,
      fields: [...DEFAULT_ISSUE_FIELDS, 'labels']
    });

    console.log(`[GET /api/tickets/user/by-account] Total: ${result.total} issues`);
    res.json(result.issues || []);
  } catch (error) {
    console.error('[GET /api/tickets/user/by-account] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route POST /api/tickets/search
 * @description Busca issues com parâmetros avançados via POST.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-post}
 * 
 * @body {string} jql - Query JQL.
 * @body {string[]} [fields] - Campos a retornar.
 * @body {string[]} [expand] - Campos a expandir.
 * @body {number} [startAt] - Índice inicial.
 * @body {number} [maxResults] - Máximo de resultados.
 * 
 * @returns {Object} 200 - Resultado da busca.
 */
app.post('/api/tickets/search', async (req, res) => {
  try {
    const {
      jql,
      fields = DEFAULT_ISSUE_FIELDS,
      expand = [],
      startAt = 0,
      maxResults = MAX_RESULTS_PER_PAGE,
      fetchAll = false
    } = req.body;

    if (!jql) {
      return res.status(400).json({ error: 'JQL é obrigatório' });
    }

    console.log(`[POST /api/tickets/search] JQL: ${jql}`);

    const result = await searchIssues({
      jql,
      fields,
      expand,
      maxResults,
      fetchAll
    });

    res.json(result);
  } catch (error) {
    console.error('[POST /api/tickets/search] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - ISSUES
// ============================================================================

/**
 * @route GET /api/tickets/:issueIdOrKey
 * @description Retorna detalhes de uma issue específica.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue (ex: "SUP-123").
 * @query {string[]} [fields] - Campos específicos a retornar.
 * @query {string[]} [expand] - Campos a expandir.
 * 
 * @returns {Object} 200 - Detalhes da issue.
 * @returns {Object} 404 - Issue não encontrada.
 */
app.get('/api/tickets/:issueIdOrKey', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    const { fields, expand } = req.query;
    
    console.log(`[GET /api/tickets/:id] Buscando: ${issueIdOrKey}`);
    
    // Constrói query string
    const params = new URLSearchParams();
    
    if (fields) {
      params.append('fields', Array.isArray(fields) ? fields.join(',') : fields);
    } else {
      params.append('fields', [...DEFAULT_ISSUE_FIELDS, 'attachment', 'worklog', 'components', 'fixVersions', 'duedate', 'timetracking'].join(','));
    }
    
    if (expand) {
      params.append('expand', Array.isArray(expand) ? expand.join(',') : expand);
    } else {
      params.append('expand', 'renderedFields,changelog,operations');
    }
    
    const issue = await jiraRequest(`/issue/${issueIdOrKey}?${params.toString()}`);
    
    console.log(`[GET /api/tickets/:id] Encontrado: ${issue.key} - ${issue.fields?.summary}`);
    res.json(issue);
  } catch (error) {
    console.error(`[GET /api/tickets/:id] Erro:`, error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route POST /api/issues
 * @description Cria uma nova issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post}
 * 
 * @body {Object} fields - Campos da issue.
 * @body {Object} fields.project - Projeto (id ou key).
 * @body {Object} fields.issuetype - Tipo de issue (id ou name).
 * @body {string} fields.summary - Resumo/título.
 * @body {string|Object} [fields.description] - Descrição (texto ou ADF).
 * @body {Object} [fields.priority] - Prioridade.
 * @body {Object} [fields.assignee] - Assignee (accountId).
 * @body {string[]} [fields.labels] - Labels.
 * @body {Object[]} [fields.components] - Componentes.
 * @body {boolean} [updateHistory=false] - Atualizar histórico do usuário.
 * 
 * @returns {Object} 201 - Issue criada.
 * @returns {Object} 400 - Dados inválidos.
 */
app.post('/api/issues', async (req, res) => {
  try {
    const { fields, updateHistory = false } = req.body;
    
    console.log('[POST /api/issues] Criando issue');
    
    // Validação dos campos obrigatórios
    if (!fields) {
      return res.status(400).json({ 
        error: 'O campo "fields" é obrigatório',
        errorMessages: ['Corpo da requisição deve conter o objeto "fields"']
      });
    }
    
    const { project, issuetype, summary } = fields;
    
    if (!project) {
      return res.status(400).json({ 
        error: 'Projeto é obrigatório',
        errorMessages: ['fields.project é obrigatório']
      });
    }
    
    if (!issuetype) {
      return res.status(400).json({ 
        error: 'Tipo de issue é obrigatório',
        errorMessages: ['fields.issuetype é obrigatório']
      });
    }
    
    if (!summary || summary.trim() === '') {
      return res.status(400).json({ 
        error: 'Resumo é obrigatório',
        errorMessages: ['fields.summary é obrigatório e não pode estar vazio']
      });
    }
    
    // Prepara o payload
    const issuePayload = {
      fields: { ...fields }
    };
    
    // Converte descrição para ADF se for string
    if (typeof fields.description === 'string') {
      issuePayload.fields.description = buildAdfDocument(fields.description);
    }
    
    // Normaliza project
    if (typeof fields.project === 'string') {
      issuePayload.fields.project = { key: fields.project };
    }
    
    // Normaliza issuetype
    if (typeof fields.issuetype === 'string') {
      issuePayload.fields.issuetype = { name: fields.issuetype };
    }
    
    // Normaliza priority
    if (typeof fields.priority === 'string') {
      issuePayload.fields.priority = { name: fields.priority };
    }
    
    // Normaliza assignee
    if (typeof fields.assignee === 'string') {
      issuePayload.fields.assignee = { accountId: fields.assignee };
    }
    
    console.log('[POST /api/issues] Payload:', JSON.stringify(issuePayload, null, 2));
    
    const endpoint = `/issue${updateHistory ? '?updateHistory=true' : ''}`;
    const newIssue = await jiraRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(issuePayload)
    });
    
    console.log(`[POST /api/issues] Criada: ${newIssue.key}`);
    res.status(201).json(newIssue);
  } catch (error) {
    console.error('[POST /api/issues] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/issues/:issueIdOrKey
 * @description Atualiza uma issue existente.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue.
 * @body {Object} fields - Campos a atualizar.
 * @body {Object} [update] - Operações de atualização (add, set, remove).
 * @query {boolean} [notifyUsers=true] - Notificar usuários.
 * 
 * @returns {Object} 204 - Atualizado com sucesso.
 * @returns {Object} 400 - Dados inválidos.
 */
app.put('/api/issues/:issueIdOrKey', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    const { notifyUsers = 'true' } = req.query;
    const { fields, update } = req.body;
    
    console.log(`[PUT /api/issues/:id] Atualizando: ${issueIdOrKey}`);
    
    const payload = {};
    
    if (fields) {
      payload.fields = { ...fields };
      
      // Converte descrição para ADF se for string
      if (typeof fields.description === 'string') {
        payload.fields.description = buildAdfDocument(fields.description);
      }
    }
    
    if (update) {
      payload.update = update;
    }
    
    const endpoint = `/issue/${issueIdOrKey}?notifyUsers=${notifyUsers}`;
    await jiraRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    
    console.log(`[PUT /api/issues/:id] Atualizado: ${issueIdOrKey}`);
    res.status(204).send();
  } catch (error) {
    console.error('[PUT /api/issues/:id] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/issues/:issueIdOrKey
 * @description Remove uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-delete}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue.
 * @query {string} [deleteSubtasks=false] - Deletar subtasks também.
 * 
 * @returns {Object} 204 - Removido com sucesso.
 * @returns {Object} 400 - Tem subtasks e deleteSubtasks=false.
 * @returns {Object} 404 - Issue não encontrada.
 */
app.delete('/api/issues/:issueIdOrKey', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    const { deleteSubtasks = 'false' } = req.query;
    
    console.log(`[DELETE /api/issues/:id] Removendo: ${issueIdOrKey}`);
    
    await jiraRequest(`/issue/${issueIdOrKey}?deleteSubtasks=${deleteSubtasks}`, {
      method: 'DELETE'
    });
    
    console.log(`[DELETE /api/issues/:id] Removido: ${issueIdOrKey}`);
    res.status(204).send();
  } catch (error) {
    console.error('[DELETE /api/issues/:id] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - ISSUE TRANSITIONS
// ============================================================================

/**
 * @route GET /api/issues/:issueIdOrKey/transitions
 * @description Retorna as transições disponíveis para uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-get}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue.
 * 
 * @returns {Object} 200 - Lista de transições disponíveis.
 */
app.get('/api/issues/:issueIdOrKey/transitions', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    
    console.log(`[GET /api/issues/:id/transitions] Issue: ${issueIdOrKey}`);
    
    const result = await jiraRequest(`/issue/${issueIdOrKey}/transitions?expand=transitions.fields`);
    
    console.log(`[GET /api/issues/:id/transitions] ${result.transitions?.length || 0} transições`);
    res.json(result);
  } catch (error) {
    console.error('[GET /api/issues/:id/transitions] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route POST /api/issues/:issueIdOrKey/transitions
 * @description Executa uma transição em uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-transitions-post}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue.
 * @body {Object} transition - Transição a executar.
 * @body {string} transition.id - ID da transição.
 * @body {Object} [fields] - Campos a atualizar durante a transição.
 * @body {Object} [update] - Operações de atualização.
 * 
 * @returns {Object} 204 - Transição executada.
 */
app.post('/api/issues/:issueIdOrKey/transitions', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    const { transition, fields, update } = req.body;
    
    console.log(`[POST /api/issues/:id/transitions] Issue: ${issueIdOrKey}, Transition: ${transition?.id}`);
    
    if (!transition?.id) {
      return res.status(400).json({ error: 'transition.id é obrigatório' });
    }
    
    const payload = { transition };
    if (fields) payload.fields = fields;
    if (update) payload.update = update;
    
    await jiraRequest(`/issue/${issueIdOrKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log(`[POST /api/issues/:id/transitions] Transição executada`);
    res.status(204).send();
  } catch (error) {
    console.error('[POST /api/issues/:id/transitions] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - COMMENTS
// ============================================================================

/**
 * @route GET /api/issues/:issueIdOrKey/comments
 * @description Retorna comentários de uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-get}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue.
 * @query {number} [startAt=0] - Índice inicial.
 * @query {number} [maxResults=50] - Máximo de resultados.
 * @query {string} [orderBy] - Ordenação (created, -created).
 * 
 * @returns {Object} 200 - Lista de comentários.
 */
app.get('/api/issues/:issueIdOrKey/comments', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    const { startAt = 0, maxResults = 50, orderBy = '-created' } = req.query;
    
    console.log(`[GET /api/issues/:id/comments] Issue: ${issueIdOrKey}`);
    
    const params = new URLSearchParams({
      startAt: startAt.toString(),
      maxResults: maxResults.toString(),
      orderBy,
      expand: 'renderedBody'
    });
    
    const result = await jiraRequest(`/issue/${issueIdOrKey}/comment?${params.toString()}`);
    
    console.log(`[GET /api/issues/:id/comments] ${result.total || 0} comentários`);
    res.json(result);
  } catch (error) {
    console.error('[GET /api/issues/:id/comments] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route POST /api/issues/:issueIdOrKey/comments
 * @description Adiciona um comentário a uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-post}
 * 
 * @param {string} issueIdOrKey - ID ou chave da issue.
 * @body {string|Object} body - Corpo do comentário (texto ou ADF).
 * @body {Object} [visibility] - Restrição de visibilidade.
 * 
 * @returns {Object} 201 - Comentário criado.
 */
app.post('/api/issues/:issueIdOrKey/comments', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    let { body, visibility } = req.body;
    
    console.log(`[POST /api/issues/:id/comments] Issue: ${issueIdOrKey}`);
    
    if (!body) {
      return res.status(400).json({ error: 'O corpo do comentário é obrigatório' });
    }
    
    // Converte para ADF se for string
    if (typeof body === 'string') {
      body = buildAdfDocument(body);
    }
    
    const payload = { body };
    if (visibility) {
      payload.visibility = visibility;
    }
    
    const comment = await jiraRequest(`/issue/${issueIdOrKey}/comment`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log(`[POST /api/issues/:id/comments] Comentário criado: ${comment.id}`);
    res.status(201).json(comment);
  } catch (error) {
    console.error('[POST /api/issues/:id/comments] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/issues/:issueIdOrKey/comments/:commentId
 * @description Atualiza um comentário.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-id-put}
 */
app.put('/api/issues/:issueIdOrKey/comments/:commentId', async (req, res) => {
  try {
    const { issueIdOrKey, commentId } = req.params;
    let { body, visibility } = req.body;
    
    console.log(`[PUT /api/issues/:id/comments/:cid] Issue: ${issueIdOrKey}, Comment: ${commentId}`);
    
    if (typeof body === 'string') {
      body = buildAdfDocument(body);
    }
    
    const payload = { body };
    if (visibility) {
      payload.visibility = visibility;
    }
    
    const comment = await jiraRequest(`/issue/${issueIdOrKey}/comment/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    
    res.json(comment);
  } catch (error) {
    console.error('[PUT /api/issues/:id/comments/:cid] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/issues/:issueIdOrKey/comments/:commentId
 * @description Remove um comentário.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-id-delete}
 */
app.delete('/api/issues/:issueIdOrKey/comments/:commentId', async (req, res) => {
  try {
    const { issueIdOrKey, commentId } = req.params;
    
    console.log(`[DELETE /api/issues/:id/comments/:cid] Issue: ${issueIdOrKey}, Comment: ${commentId}`);
    
    await jiraRequest(`/issue/${issueIdOrKey}/comment/${commentId}`, {
      method: 'DELETE'
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('[DELETE /api/issues/:id/comments/:cid] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - PROJECTS
// ============================================================================

/**
 * @route GET /api/projects
 * @description Retorna projetos com paginação.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/#api-rest-api-3-project-search-get}
 * 
 * @query {number} [startAt=0] - Índice inicial.
 * @query {number} [maxResults=50] - Máximo de resultados.
 * @query {string} [orderBy] - Campo de ordenação.
 * @query {string} [query] - Filtro por nome/chave.
 * @query {string} [expand] - Campos a expandir.
 * 
 * @returns {Object} 200 - Lista paginada de projetos.
 */
app.get('/api/projects', async (req, res) => {
  try {
    const { 
      startAt = 0, 
      maxResults = 50, 
      orderBy = 'name',
      query,
      expand = 'description,lead,issueTypes'
    } = req.query;
    
    console.log('[GET /api/projects] Buscando projetos');
    
    const params = new URLSearchParams({
      startAt: startAt.toString(),
      maxResults: maxResults.toString(),
      orderBy,
      expand
    });
    
    if (query) {
      params.append('query', query);
    }
    
    const result = await jiraRequest(`/project/search?${params.toString()}`);
    
    console.log(`[GET /api/projects] ${result.total || result.values?.length || 0} projetos`);
    res.json(result);
  } catch (error) {
    console.error('[GET /api/projects] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/projects/:projectIdOrKey
 * @description Retorna detalhes de um projeto.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/#api-rest-api-3-project-projectidorkey-get}
 * 
 * @param {string} projectIdOrKey - ID ou chave do projeto.
 * @query {string} [expand] - Campos a expandir.
 * 
 * @returns {Object} 200 - Detalhes do projeto.
 */
app.get('/api/projects/:projectIdOrKey', async (req, res) => {
  try {
    const { projectIdOrKey } = req.params;
    const { expand = 'description,lead,issueTypes,components,versions' } = req.query;
    
    console.log(`[GET /api/projects/:id] Projeto: ${projectIdOrKey}`);
    
    const project = await jiraRequest(`/project/${projectIdOrKey}?expand=${expand}`);
    
    console.log(`[GET /api/projects/:id] Nome: ${project.name}`);
    res.json(project);
  } catch (error) {
    console.error('[GET /api/projects/:id] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/projects/:projectIdOrKey/statuses
 * @description Retorna os status disponíveis para cada tipo de issue do projeto.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/#api-rest-api-3-project-projectidorkey-statuses-get}
 */
app.get('/api/projects/:projectIdOrKey/statuses', async (req, res) => {
  try {
    const { projectIdOrKey } = req.params;
    
    console.log(`[GET /api/projects/:id/statuses] Projeto: ${projectIdOrKey}`);
    
    const statuses = await jiraRequest(`/project/${projectIdOrKey}/statuses`);
    
    res.json(statuses);
  } catch (error) {
    console.error('[GET /api/projects/:id/statuses] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - ISSUE TYPES
// ============================================================================

/**
 * @route GET /api/issuetype
 * @description Retorna todos os tipos de issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-types/#api-rest-api-3-issuetype-get}
 * 
 * @returns {Array} 200 - Lista de tipos de issue.
 */
app.get('/api/issuetype', async (req, res) => {
  try {
    console.log('[GET /api/issuetype] Buscando tipos de issue');
    
    const issueTypes = await jiraRequest('/issuetype');
    
    console.log(`[GET /api/issuetype] ${issueTypes.length} tipos encontrados`);
    res.json(issueTypes);
  } catch (error) {
    console.error('[GET /api/issuetype] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/issuetype/project
 * @description Retorna tipos de issue para um projeto específico.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-types/#api-rest-api-3-issuetype-project-get}
 * 
 * @query {string} projectId - ID do projeto.
 * 
 * @returns {Array} 200 - Lista de tipos de issue do projeto.
 */
app.get('/api/issuetype/project', async (req, res) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({ error: 'projectId é obrigatório' });
    }
    
    console.log(`[GET /api/issuetype/project] Projeto: ${projectId}`);
    
    const issueTypes = await jiraRequest(`/issuetype/project?projectId=${projectId}`);
    
    console.log(`[GET /api/issuetype/project] ${issueTypes.length} tipos encontrados`);
    res.json(issueTypes);
  } catch (error) {
    console.error('[GET /api/issuetype/project] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - PRIORITIES
// ============================================================================

/**
 * @route GET /api/priority
 * @description Retorna todas as prioridades.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-priorities/#api-rest-api-3-priority-get}
 * 
 * @returns {Array} 200 - Lista de prioridades.
 */
app.get('/api/priority', async (req, res) => {
  try {
    console.log('[GET /api/priority] Buscando prioridades');
    
    const priorities = await jiraRequest('/priority');
    
    console.log(`[GET /api/priority] ${priorities.length} prioridades encontradas`);
    res.json(priorities);
  } catch (error) {
    console.error('[GET /api/priority] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - USERS
// ============================================================================

/**
 * @route GET /api/user/search
 * @description Busca usuários.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-search-get}
 * 
 * @query {string} [query] - Texto para busca.
 * @query {number} [startAt=0] - Índice inicial.
 * @query {number} [maxResults=50] - Máximo de resultados.
 * 
 * @returns {Array} 200 - Lista de usuários.
 */
app.get('/api/user/search', async (req, res) => {
  try {
    const { query = '', startAt = 0, maxResults = 50 } = req.query;
    
    console.log(`[GET /api/user/search] Query: ${query}`);
    
    const params = new URLSearchParams({
      query,
      startAt: startAt.toString(),
      maxResults: maxResults.toString()
    });
    
    const users = await jiraRequest(`/user/search?${params.toString()}`);
    
    console.log(`[GET /api/user/search] ${users.length} usuários encontrados`);
    res.json(users);
  } catch (error) {
    console.error('[GET /api/user/search] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/user/assignable/search
 * @description Busca usuários que podem ser atribuídos a issues.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-assignable-search-get}
 * 
 * @query {string} [project] - Chave do projeto.
 * @query {string} [issueKey] - Chave da issue.
 * @query {string} [query] - Texto para busca.
 * 
 * @returns {Array} 200 - Lista de usuários assignáveis.
 */
app.get('/api/user/assignable/search', async (req, res) => {
  try {
    const { project, issueKey, query = '', maxResults = 50 } = req.query;
    
    console.log(`[GET /api/user/assignable/search] Project: ${project}, Issue: ${issueKey}`);
    
    const params = new URLSearchParams({
      query,
      maxResults: maxResults.toString()
    });
    
    if (project) params.append('project', project);
    if (issueKey) params.append('issueKey', issueKey);
    
    const users = await jiraRequest(`/user/assignable/search?${params.toString()}`);
    
    console.log(`[GET /api/user/assignable/search] ${users.length} usuários encontrados`);
    res.json(users);
  } catch (error) {
    console.error('[GET /api/user/assignable/search] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - ISSUE WATCHERS
// ============================================================================

/**
 * @route GET /api/issues/:issueIdOrKey/watchers
 * @description Retorna watchers de uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-watchers/#api-rest-api-3-issue-issueidorkey-watchers-get}
 */
app.get('/api/issues/:issueIdOrKey/watchers', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    
    console.log(`[GET /api/issues/:id/watchers] Issue: ${issueIdOrKey}`);
    
    const watchers = await jiraRequest(`/issue/${issueIdOrKey}/watchers`);
    
    res.json(watchers);
  } catch (error) {
    console.error('[GET /api/issues/:id/watchers] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route POST /api/issues/:issueIdOrKey/watchers
 * @description Adiciona um watcher a uma issue.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-watchers/#api-rest-api-3-issue-issueidorkey-watchers-post}
 * 
 * @body {string} accountId - Account ID do usuário a adicionar.
 */
app.post('/api/issues/:issueIdOrKey/watchers', async (req, res) => {
  try {
    const { issueIdOrKey } = req.params;
    const accountId = req.body;
    
    console.log(`[POST /api/issues/:id/watchers] Issue: ${issueIdOrKey}`);
    
    await jiraRequest(`/issue/${issueIdOrKey}/watchers`, {
      method: 'POST',
      body: JSON.stringify(accountId)
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('[POST /api/issues/:id/watchers] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - ATTACHMENTS
// ============================================================================

/**
 * @route GET /api/attachment/:attachmentId
 * @description Retorna metadados de um anexo.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/#api-rest-api-3-attachment-id-get}
 */
app.get('/api/attachment/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    
    console.log(`[GET /api/attachment/:id] Attachment: ${attachmentId}`);
    
    const attachment = await jiraRequest(`/attachment/${attachmentId}`);
    
    res.json(attachment);
  } catch (error) {
    console.error('[GET /api/attachment/:id] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS DA API - FIELD CONFIGURATION
// ============================================================================

/**
 * @route GET /api/field
 * @description Retorna todos os campos (system e custom).
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-fields/#api-rest-api-3-field-get}
 */
app.get('/api/field', async (req, res) => {
  try {
    console.log('[GET /api/field] Buscando campos');
    
    const fields = await jiraRequest('/field');
    
    console.log(`[GET /api/field] ${fields.length} campos encontrados`);
    res.json(fields);
  } catch (error) {
    console.error('[GET /api/field] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * @route GET /api/issue/createmeta
 * @description Retorna metadados para criação de issues.
 * 
 * @see {@link https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-createmeta-get}
 * 
 * @query {string} [projectIds] - IDs dos projetos.
 * @query {string} [projectKeys] - Chaves dos projetos.
 * @query {string} [issuetypeIds] - IDs dos tipos de issue.
 * @query {string} [issuetypeNames] - Nomes dos tipos de issue.
 * @query {string} [expand] - Campos a expandir.
 */
app.get('/api/issue/createmeta', async (req, res) => {
  try {
    const { projectIds, projectKeys, issuetypeIds, issuetypeNames, expand = 'projects.issuetypes.fields' } = req.query;
    
    console.log('[GET /api/issue/createmeta] Buscando metadados de criação');
    
    const params = new URLSearchParams({ expand });
    if (projectIds) params.append('projectIds', projectIds);
    if (projectKeys) params.append('projectKeys', projectKeys);
    if (issuetypeIds) params.append('issuetypeIds', issuetypeIds);
    if (issuetypeNames) params.append('issuetypeNames', issuetypeNames);
    
    const meta = await jiraRequest(`/issue/createmeta?${params.toString()}`);
    
    res.json(meta);
  } catch (error) {
    console.error('[GET /api/issue/createmeta] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// ROTAS AUXILIARES - COMPATIBILIDADE
// ============================================================================

/**
 * @route GET /api/projects/:projectId/issuetypes
 * @description Retorna tipos de issue de um projeto (compatibilidade).
 * @deprecated Use GET /api/issuetype/project?projectId={id}
 */
app.get('/api/projects/:projectId/issuetypes', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    console.log(`[GET /api/projects/:id/issuetypes] Projeto: ${projectId}`);
    
    // Busca o projeto para obter os tipos de issue
    const project = await jiraRequest(`/project/${projectId}?expand=issueTypes`);
    
    res.json(project.issueTypes || []);
  } catch (error) {
    console.error('[GET /api/projects/:id/issuetypes] Erro:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * @route GET /api/health
 * @description Verifica status do servidor e conectividade com Jira.
 */
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage()
    },
    jira: {
      baseUrl: JIRA_BASE_URL,
      connected: false
    }
  };

  try {
    // Tenta conectar ao Jira
    await jiraRequest('/myself');
    health.jira.connected = true;
  } catch (error) {
    health.jira.connected = false;
    health.jira.error = error.message;
  }

  const statusCode = health.jira.connected ? 200 : 503;
  res.status(statusCode).json(health);
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Middleware para rotas não encontradas.
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.path,
    method: req.method
  });
});

/**
 * Middleware global de tratamento de erros.
 */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

app.listen(PORT, () => {
  console.log('═'.repeat(70));
  console.log('🚀 JIRA API PROXY SERVER v2.0');
  console.log('═'.repeat(70));
  console.log(`📡 Servidor:     http://localhost:${PORT}`);
  console.log(`🔗 Jira API:     ${JIRA_BASE_URL}`);
  console.log(`📖 API Docs:     https://developer.atlassian.com/cloud/jira/platform/rest/v3/`);
  console.log('═'.repeat(70));
  console.log('📋 ENDPOINTS DISPONÍVEIS:');
  console.log('─'.repeat(70));
  console.log('  MYSELF');
  console.log('    GET  /api/user                           Usuário autenticado');
  console.log('');
  console.log('  ISSUES - SEARCH');
  console.log('    GET  /api/tickets                        Buscar issues');
  console.log('    GET  /api/tickets/assigned               Issues atribuídas');
  console.log('    GET  /api/tickets/reported               Issues reportadas');
  console.log('    GET  /api/tickets/user/:accountId        Issues por usuário');
  console.log('    POST /api/tickets/search                 Busca avançada');
  console.log('');
  console.log('  ISSUES - CRUD');
  console.log('    GET  /api/tickets/:key                   Detalhes da issue');
  console.log('    POST /api/issues                         Criar issue');
  console.log('    PUT  /api/issues/:key                    Atualizar issue');
  console.log('    DEL  /api/issues/:key                    Remover issue');
  console.log('');
  console.log('  TRANSITIONS');
  console.log('    GET  /api/issues/:key/transitions        Transições disponíveis');
  console.log('    POST /api/issues/:key/transitions        Executar transição');
  console.log('');
  console.log('  COMMENTS');
  console.log('    GET  /api/issues/:key/comments           Listar comentários');
  console.log('    POST /api/issues/:key/comments           Adicionar comentário');
  console.log('    PUT  /api/issues/:key/comments/:id       Atualizar comentário');
  console.log('    DEL  /api/issues/:key/comments/:id       Remover comentário');
  console.log('');
  console.log('  PROJECTS');
  console.log('    GET  /api/projects                       Listar projetos');
  console.log('    GET  /api/projects/:key                  Detalhes do projeto');
  console.log('    GET  /api/projects/:key/statuses         Status do projeto');
  console.log('');
  console.log('  METADATA');
  console.log('    GET  /api/issuetype                      Tipos de issue');
  console.log('    GET  /api/issuetype/project              Tipos por projeto');
  console.log('    GET  /api/priority                       Prioridades');
  console.log('    GET  /api/field                          Campos');
  console.log('    GET  /api/issue/createmeta               Metadados de criação');
  console.log('');
  console.log('  USERS');
  console.log('    GET  /api/user/search                    Buscar usuários');
  console.log('    GET  /api/user/assignable/search         Usuários assignáveis');
  console.log('');
  console.log('  WATCHERS');
  console.log('    GET  /api/issues/:key/watchers           Listar watchers');
  console.log('    POST /api/issues/:key/watchers           Adicionar watcher');
  console.log('');
  console.log('  ATTACHMENTS');
  console.log('    GET  /api/attachment/:id                 Detalhes do anexo');
  console.log('');
  console.log('  HEALTH');
  console.log('    GET  /api/health                         Status do servidor');
  console.log('═'.repeat(70));
});

module.exports = app;