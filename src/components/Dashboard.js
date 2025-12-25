/**
 * @fileoverview Componente Dashboard para visualização de tickets do Jira.
 * 
 * Este componente exibe estatísticas resumidas, lista de tickets recentes
 * e fornece funcionalidades de filtragem, criação e navegação para o Jira.
 * 
 * @author Seu Nome
 * @version 2.0.0
 * @license MIT
 */

import React, { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { formatDate } from '../api/jira';
import { useAuth } from '../contexts/AuthContext';

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Tipos de filtro disponíveis para a listagem de tickets.
 * @constant {Object}
 */
const FILTER_TYPES = {
  MY_OPEN: 'my_open',
  TEAM_OPEN: 'team_open',
  ALL: 'all'
};

/**
 * Status que indicam tickets fechados/resolvidos.
 * @constant {string[]}
 */
const CLOSED_STATUSES = ['done', 'closed', 'resolved', 'complete', 'cancelled', 'resolvido', 'concluído', 'concluido', 'finalizado'];

/**
 * Status que indicam tickets em progresso.
 * @constant {string[]}
 */
const IN_PROGRESS_STATUSES = ['progress', 'review', 'development', 'testing', 'in progress', 'em progresso', 'aguardando', 'em análise', 'em analise'];

/**
 * Número máximo de tickets a exibir na lista.
 * @constant {number}
 */
const MAX_DISPLAYED_TICKETS = 50;

/**
 * Mapeamento de prioridades para classes CSS.
 * @constant {Object}
 */
const PRIORITY_CLASS_MAP = {
  highest: 'highest',
  high: 'high',
  medium: 'medium',
  low: 'low',
  lowest: 'lowest'
};

// ============================================================================
// COMPONENTES DE ÍCONES SVG
// ============================================================================

/**
 * Ícone de círculo aberto (tickets abertos).
 * @component
 */
const OpenIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
  </svg>
);

/**
 * Ícone de relógio (tickets em progresso).
 * @component
 */
const ProgressIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/**
 * Ícone de check (tickets fechados).
 * @component
 */
const ClosedIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

/**
 * Ícone de documento (total de tickets).
 * @component
 */
const DocumentIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
    <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

/**
 * Ícone de refresh/atualizar.
 * @component
 */
const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M23 20V14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * Ícone de olho (ver detalhes).
 * @component
 */
const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
  </svg>
);

/**
 * Ícone de link externo (abrir no Jira).
 * @component
 */
const ExternalLinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 7H17V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

/**
 * Verifica se o status de um ticket indica que está fechado.
 * 
 * @param {string} statusName - Nome do status do ticket.
 * @returns {boolean} True se o ticket está fechado.
 * 
 * @example
 * isClosedStatus('Done'); // true
 * isClosedStatus('In Progress'); // false
 */
const isClosedStatus = (statusName) => {
  if (!statusName) return false;
  const normalizedStatus = statusName.toLowerCase();
  return CLOSED_STATUSES.some(status => normalizedStatus.includes(status));
};

/**
 * Verifica se o status de um ticket indica que está em progresso.
 * 
 * @param {string} statusName - Nome do status do ticket.
 * @returns {boolean} True se o ticket está em progresso.
 * 
 * @example
 * isInProgressStatus('In Progress'); // true
 * isInProgressStatus('Open'); // false
 */
const isInProgressStatus = (statusName) => {
  if (!statusName) return false;
  const normalizedStatus = statusName.toLowerCase();
  return IN_PROGRESS_STATUSES.some(status => normalizedStatus.includes(status));
};

/**
 * Obtém a classe CSS correspondente à prioridade do ticket.
 * 
 * @param {string} priorityName - Nome da prioridade.
 * @returns {string} Classe CSS para a prioridade.
 * 
 * @example
 * getPriorityClass('High'); // 'high'
 * getPriorityClass(undefined); // 'medium'
 */
const getPriorityClass = (priorityName) => {
  if (!priorityName) return 'medium';
  const normalized = priorityName.toLowerCase();
  return PRIORITY_CLASS_MAP[normalized] || 'medium';
};

/**
 * Gera a URL do ticket no Jira.
 * 
 * @param {string} ticketKey - Chave do ticket (ex: "SUP-123").
 * @returns {string} URL completa do ticket no Jira.
 */
const getJiraTicketUrl = (ticketKey) => {
  const domain = process.env.REACT_APP_JIRA_DOMAIN;
  return `https://${domain}/browse/${ticketKey}`;
};

// ============================================================================
// SUB-COMPONENTES
// ============================================================================

/**
 * Componente de cartão de estatística.
 * 
 * @component
 * @param {Object} props - Propriedades do componente.
 * @param {React.ReactNode} props.icon - Ícone a ser exibido.
 * @param {string} props.iconType - Tipo do ícone para estilização (open, progress, closed, total).
 * @param {number} props.value - Valor numérico a ser exibido.
 * @param {string} props.label - Rótulo descritivo.
 * 
 * @example
 * <StatCard 
 *   icon={<OpenIcon />} 
 *   iconType="open" 
 *   value={15} 
 *   label="Tickets Abertos" 
 * />
 */
const StatCard = ({ icon, iconType, value, label }) => (
  <div className="stat-card">
    <div className={`stat-icon ${iconType}`}>
      {icon}
    </div>
    <div className="stat-content">
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  </div>
);

StatCard.propTypes = {
  icon: PropTypes.node.isRequired,
  iconType: PropTypes.oneOf(['open', 'progress', 'closed', 'total']).isRequired,
  value: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired
};

/**
 * Componente de estado vazio (quando não há tickets).
 * 
 * @component
 * @param {Object} props - Propriedades do componente.
 * @param {string} props.filterType - Tipo de filtro atual.
 */
const EmptyState = ({ filterType }) => {
  const isOpenFilter = filterType === FILTER_TYPES.OPEN;
  
  return (
    <div className="empty-state">
      <div className="empty-icon">🎉</div>
      <h3 className="empty-title">
        {isOpenFilter ? 'Nenhum ticket aberto!' : 'Nenhum ticket encontrado!'}
      </h3>
      <p className="empty-description">
        {isOpenFilter 
          ? 'Você ainda não criou nenhum ticket aberto.' 
          : 'Não há tickets para exibir.'}
      </p>
    </div>
  );
};

EmptyState.propTypes = {
  filterType: PropTypes.oneOf(Object.values(FILTER_TYPES)).isRequired
};

/**
 * Componente de detalhes expandidos do ticket.
 * 
 * @component
 * @param {Object} props - Propriedades do componente.
 * @param {Object} props.ticket - Dados do ticket.
 */
const TicketExpandedDetails = ({ ticket }) => {
  const { fields } = ticket;
  
  return (
    <div className="ticket-expanded">
      <div className="expanded-content">
        <div className="expanded-grid">
          <div className="expanded-item">
            <strong>Responsável:</strong>
            <span>{fields.assignee?.displayName || 'Não atribuído'}</span>
          </div>
          <div className="expanded-item">
            <strong>Relator:</strong>
            <span>{fields.reporter?.displayName || 'Desconhecido'}</span>
          </div>
          <div className="expanded-item">
            <strong>Atualizado:</strong>
            <span>{formatDate(fields.updated)}</span>
          </div>
          <div className="expanded-item">
            <strong>Chave do Projeto:</strong>
            <span>{fields.project?.key}</span>
          </div>
          {fields.labels && fields.labels.length > 0 && (
            <div className="expanded-item full-width">
              <strong>Labels:</strong>
              <span className="labels-list">
                {fields.labels.map((label, index) => (
                  <span key={index} className="label-tag">{label}</span>
                ))}
              </span>
            </div>
          )}
          {fields.components && fields.components.length > 0 && (
            <div className="expanded-item full-width">
              <strong>Componentes:</strong>
              <span>{fields.components.map(c => c.name).join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

TicketExpandedDetails.propTypes = {
  ticket: PropTypes.shape({
    fields: PropTypes.shape({
      assignee: PropTypes.shape({
        displayName: PropTypes.string
      }),
      reporter: PropTypes.shape({
        displayName: PropTypes.string
      }),
      updated: PropTypes.string,
      project: PropTypes.shape({
        key: PropTypes.string
      }),
      labels: PropTypes.arrayOf(PropTypes.string),
      components: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string
      }))
    })
  }).isRequired
};

/**
 * Componente individual de cartão de ticket.
 * 
 * @component
 * @param {Object} props - Propriedades do componente.
 * @param {Object} props.ticket - Dados do ticket.
 * @param {boolean} props.isExpanded - Se o ticket está expandido.
 * @param {Function} props.onToggleExpand - Callback para expandir/recolher.
 * @param {Function} props.onViewDetails - Callback para ver detalhes.
 * @param {Function} props.onOpenInJira - Callback para abrir no Jira.
 */
const TicketCard = ({ 
  ticket, 
  isExpanded, 
  onToggleExpand, 
  onViewDetails, 
  onOpenInJira 
}) => {
  const { key, fields } = ticket;
  
  /**
   * Handler para clique no card (toggle expand).
   * @param {React.MouseEvent} event - Evento de clique.
   */
  const handleCardClick = useCallback(() => {
    onToggleExpand(ticket);
  }, [ticket, onToggleExpand]);
  
  /**
   * Handler para botão "Ver Detalhes".
   * @param {React.MouseEvent} event - Evento de clique.
   */
  const handleViewDetails = useCallback((event) => {
    event.stopPropagation();
    onViewDetails(ticket);
  }, [ticket, onViewDetails]);
  
  /**
   * Handler para botão "Abrir no Jira".
   * @param {React.MouseEvent} event - Evento de clique.
   */
  const handleOpenInJira = useCallback((event) => {
    event.stopPropagation();
    onOpenInJira(key);
  }, [key, onOpenInJira]);
  
  return (
    <div 
      className={`ticket-card ${isExpanded ? 'expanded' : ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => e.key === 'Enter' && handleCardClick()}
      aria-expanded={isExpanded}
    >
      {/* Header do Ticket */}
      <div className="ticket-header">
        <div className="ticket-meta">
          <span className="ticket-key">{key}</span>
          <span className={`priority-badge ${getPriorityClass(fields.priority?.name)}`}>
            {fields.priority?.name || 'Medium'}
          </span>
          <span className={`status-badge status-${fields.status?.statusCategory?.key || 'default'}`}>
            {fields.status?.name || 'Unknown'}
          </span>
        </div>
        
        <div className="ticket-actions">
          <button 
            onClick={handleViewDetails}
            className="show-details-btn"
            aria-label={`Ver detalhes do ticket ${key}`}
          >
            <EyeIcon />
            <span>Ver Detalhes</span>
          </button>
          <button 
            onClick={handleOpenInJira}
            className="view-jira-btn"
            aria-label={`Abrir ticket ${key} no Jira`}
          >
            <ExternalLinkIcon />
            <span>Abrir no Jira</span>
          </button>
        </div>
      </div>
      
      {/* Conteúdo do Ticket */}
      <div className="ticket-content">
        <h3 className="ticket-title">{fields.summary}</h3>
        
        <div className="ticket-details">
          <span className="detail-item">
            <strong>Projeto:</strong> {fields.project?.name}
          </span>
          <span className="detail-item">
            <strong>Tipo:</strong> {fields.issuetype?.name}
          </span>
          <span className="detail-item">
            <strong>Criado:</strong> {formatDate(fields.created)}
          </span>
        </div>
      </div>
      
      {/* Detalhes Expandidos */}
      {isExpanded && <TicketExpandedDetails ticket={ticket} />}
    </div>
  );
};

TicketCard.propTypes = {
  ticket: PropTypes.shape({
    id: PropTypes.string.isRequired,
    key: PropTypes.string.isRequired,
    fields: PropTypes.shape({
      summary: PropTypes.string,
      status: PropTypes.shape({
        name: PropTypes.string,
        statusCategory: PropTypes.shape({
          key: PropTypes.string
        })
      }),
      priority: PropTypes.shape({
        name: PropTypes.string
      }),
      project: PropTypes.shape({
        name: PropTypes.string,
        key: PropTypes.string
      }),
      issuetype: PropTypes.shape({
        name: PropTypes.string
      }),
      created: PropTypes.string,
      updated: PropTypes.string,
      assignee: PropTypes.shape({
        displayName: PropTypes.string
      }),
      reporter: PropTypes.shape({
        displayName: PropTypes.string
      })
    })
  }).isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onToggleExpand: PropTypes.func.isRequired,
  onViewDetails: PropTypes.func.isRequired,
  onOpenInJira: PropTypes.func.isRequired
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

/**
 * Componente Dashboard para visualização e gerenciamento de tickets do Jira.
 * 
 * Exibe estatísticas resumidas (tickets abertos, em progresso, fechados, total),
 * uma lista filtrável de tickets recentes e ações para criar novos tickets
 * ou abrir tickets existentes no Jira.
 * 
 * @component
 * @param {Object} props - Propriedades do componente.
 * @param {Array<Object>} props.allTickets - Lista completa de tickets.
 * @param {Object} [props.user] - Dados do usuário autenticado.
 * @param {Function} props.onTicketClick - Callback quando um ticket é clicado.
 * @param {Object|null} props.selectedTicket - Ticket atualmente selecionado.
 * @param {Function} props.onCreateRequest - Callback para criar nova solicitação.
 * @param {Function} props.onRefresh - Callback para atualizar dados.
 * 
 * @example
 * <Dashboard
 *   allTickets={tickets}
 *   user={currentUser}
 *   onTicketClick={handleTicketClick}
 *   selectedTicket={selected}
 *   onCreateRequest={handleCreate}
 *   onRefresh={handleRefresh}
 * />
 */
function Dashboard({ 
  allTickets = [], 
  user, 
  onTicketClick, 
  selectedTicket, 
  onCreateRequest, 
  onRefresh 
}) {
  // ============================================================================
  // STATE
  // ============================================================================
  
  /**
   * Estado do filtro atual.
   * @type {[string, Function]}
   */
  const [filter, setFilter] = useState(FILTER_TYPES.MY_OPEN || 'my_open');
  const { signOut } = useAuth();

  /**
   * Estado do termo de pesquisa.
   * @type {[string, Function]}
   */
  const [searchTerm, setSearchTerm] = useState('');
  
  // ============================================================================
  // COMPUTED VALUES (MEMOIZED)
  // ============================================================================
  
  /**
   * Estatísticas calculadas dos tickets.
   */
  const statistics = useMemo(() => {
    // Tickets do usuário logado
    const myTickets = allTickets.filter(ticket => 
      ticket.fields?.reporter?.emailAddress === user?.emailAddress || 
      ticket.fields?.reporter?.accountId === user?.accountId
    );

    const open = allTickets.filter(ticket => !isClosedStatus(ticket.fields?.status?.name));
    const myOpen = myTickets.filter(ticket => !isClosedStatus(ticket.fields?.status?.name));
    
    const inProgress = allTickets.filter(ticket => isInProgressStatus(ticket.fields?.status?.name));
    const closed = allTickets.filter(ticket => isClosedStatus(ticket.fields?.status?.name));
    
    return {
      open: open.length,
      myOpen: myOpen.length,
      inProgress: inProgress.length,
      closed: closed.length,
      total: allTickets.length,
      openTickets: open,
      myOpenTickets: myOpen
    };
  }, [allTickets, user]);
  
  /**
   * Tickets a serem exibidos com base no filtro atual e busca.
   */
  const displayedTickets = useMemo(() => {
    let tickets = [];
    
    switch(filter) {
      case 'team_open':
        tickets = statistics.openTickets;
        break;
      case 'all':
        tickets = allTickets;
        break;
      case 'my_open':
      default:
        tickets = statistics.myOpenTickets;
    }

    // Filtrar por termo de pesquisa se houver
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      tickets = tickets.filter(ticket => 
        ticket.key.toLowerCase().includes(term) ||
        ticket.fields.summary.toLowerCase().includes(term) ||
        ticket.fields.reporter?.displayName?.toLowerCase().includes(term) ||
        ticket.fields.reporter?.emailAddress?.toLowerCase().includes(term)
      );
    }
    
    return tickets.slice(0, MAX_DISPLAYED_TICKETS);
  }, [filter, allTickets, statistics, searchTerm]);
  
  // ============================================================================
  // CALLBACKS
  // ============================================================================
  
  const handleFilterMyOpen = useCallback(() => setFilter('my_open'), []);
  const handleFilterTeamOpen = useCallback(() => setFilter('team_open'), []);
  const handleFilterInProgress = useCallback(() => setFilter('in_progress'), []);
  const handleFilterClosed = useCallback(() => setFilter('closed'), []);
  const handleFilterAll = useCallback(() => setFilter('all'), []);
  
  /**
   * Toggle para expandir/recolher um ticket.
   * @param {Object} ticket - Ticket a ser expandido/recolhido.
   */
  const handleToggleExpand = useCallback((ticket) => {
    const isCurrentlySelected = selectedTicket?.id === ticket.id;
    onTicketClick(isCurrentlySelected ? null : ticket);
  }, [selectedTicket, onTicketClick]);
  
  /**
   * Abre um ticket no Jira em nova aba.
   * @param {string} ticketKey - Chave do ticket.
   */
  const handleOpenInJira = useCallback((ticketKey) => {
    const url = getJiraTicketUrl(ticketKey);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);
  
  /**
   * Handler para visualizar detalhes de um ticket.
   * @param {Object} ticket - Ticket a ser visualizado.
   */
  const handleViewDetails = useCallback((ticket) => {
    onTicketClick(ticket);
  }, [onTicketClick]);
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="dashboard-content">
      {/* ====== SEÇÃO DE ESTATÍSTICAS ====== */}
      <section className="stats-section" aria-label="Estatísticas de tickets">
        <div className="stats-grid">
          <StatCard 
            icon={<OpenIcon />}
            iconType="open"
            value={statistics.open}
            label="Tickets Abertos"
            onClick={handleFilterTeamOpen}
            isActive={filter === 'team_open'}
          />
          
          <StatCard 
            icon={<ProgressIcon />}
            iconType="progress"
            value={statistics.inProgress}
            label="Em Progresso"
            onClick={handleFilterInProgress}
            isActive={filter === 'in_progress'}
          />
          
          <StatCard 
            icon={<ClosedIcon />}
            iconType="closed"
            value={statistics.closed}
            label="Fechados"
            onClick={handleFilterClosed}
            isActive={filter === 'closed'}
          />
          
          <StatCard 
            icon={<DocumentIcon />}
            iconType="total"
            value={statistics.total}
            label="Total Criados"
            onClick={handleFilterAll}
            isActive={filter === 'all'}
          />
        </div>
      </section>

      {/* ====== SEÇÃO DE TICKETS RECENTES ====== */}
      <section className="tickets-section" aria-label="Lista de tickets">
        {/* Header da Seção */}
        <header className="section-header">
          <div className="section-header-left">
            {/* Botões de Filtro */}
            <div className="filter-buttons" role="tablist" aria-label="Filtrar tickets">
              <button
                onClick={handleFilterMyOpen}
                className={`filter-btn ${filter === 'my_open' ? 'active' : ''}`}
                role="tab"
                aria-selected={filter === 'my_open'}
              >
                Meus ({statistics.myOpen})
              </button>
              <button
                onClick={handleFilterTeamOpen}
                className={`filter-btn ${filter === 'team_open' ? 'active' : ''}`}
                role="tab"
                aria-selected={filter === 'team_open'}
              >
                Equipe ({statistics.open})
              </button>
              <button
                onClick={handleFilterAll}
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                role="tab"
                aria-selected={filter === 'all'}
              >
                Todos ({statistics.total})
              </button>
            </div>
          </div>
          
          <div className="section-header-right">
            {/* Campo de Pesquisa */}
            <div className="search-container">
              <input
                type="text"
                placeholder="Buscar tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            {/* Botão Criar Solicitação */}
            <button 
              onClick={onCreateRequest}
              className="create-request-btn"
              aria-label="Criar nova solicitação"
            >
              <span className="btn-icon" aria-hidden="true">+</span>
              Criar Solicitação
            </button>
            
            {/* Botão Atualizar */}
            <button 
              onClick={onRefresh}
              className="refresh-btn"
              title="Atualizar lista de tickets"
              aria-label="Atualizar lista de tickets"
            >
              <RefreshIcon />
            </button>
          </div>
        </header>
        
        {/* Lista de Tickets */}
        <div 
          id="tickets-list"
          className="tickets-list"
          role="tabpanel"
          aria-label={`Lista de tickets ${filter === FILTER_TYPES.OPEN ? 'abertos' : 'todos'}`}
        >
          {displayedTickets.length === 0 ? (
            <EmptyState filterType={filter} />
          ) : (
            <>
              {displayedTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isExpanded={selectedTicket?.id === ticket.id}
                  onToggleExpand={handleToggleExpand}
                  onViewDetails={handleViewDetails}
                  onOpenInJira={handleOpenInJira}
                />
              ))}
              
              {/* Indicador de mais tickets */}
              {(filter === FILTER_TYPES.ALL ? allTickets.length : statistics.open) > MAX_DISPLAYED_TICKETS && (
                <div className="more-tickets-indicator">
                  <span>
                    Mostrando {MAX_DISPLAYED_TICKETS} de {filter === FILTER_TYPES.ALL ? statistics.total : statistics.open} tickets
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ====== FOOTER ====== */}
      <footer className="dashboard-footer">
        <div className="footer-content">
          <div className="user-info">
            <span className="user-email">{user?.emailAddress || user?.email}</span>
          </div>
          <button 
            onClick={signOut} 
            className="logout-btn"
            aria-label="Sair da conta"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sair
          </button>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// PROP TYPES
// ============================================================================

Dashboard.propTypes = {
  /**
   * Lista completa de tickets do Jira.
   */
  allTickets: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      key: PropTypes.string.isRequired,
      fields: PropTypes.shape({
        summary: PropTypes.string,
        status: PropTypes.shape({
          name: PropTypes.string,
          statusCategory: PropTypes.shape({
            key: PropTypes.string
          })
        }),
        priority: PropTypes.shape({
          name: PropTypes.string
        }),
        project: PropTypes.shape({
          name: PropTypes.string,
          key: PropTypes.string
        }),
        issuetype: PropTypes.shape({
          name: PropTypes.string
        }),
        created: PropTypes.string,
        updated: PropTypes.string,
        assignee: PropTypes.shape({
          displayName: PropTypes.string,
          accountId: PropTypes.string
        }),
        reporter: PropTypes.shape({
          displayName: PropTypes.string,
          accountId: PropTypes.string
        }),
        labels: PropTypes.arrayOf(PropTypes.string),
        components: PropTypes.arrayOf(
          PropTypes.shape({
            name: PropTypes.string
          })
        )
      })
    })
  ),
  
  /**
   * Dados do usuário autenticado.
   */
  user: PropTypes.shape({
    accountId: PropTypes.string,
    displayName: PropTypes.string,
    emailAddress: PropTypes.string,
    avatarUrls: PropTypes.object
  }),
  
  /**
   * Callback chamado quando um ticket é clicado.
   * Recebe o ticket clicado ou null para desselecionar.
   */
  onTicketClick: PropTypes.func.isRequired,
  
  /**
   * Ticket atualmente selecionado/expandido.
   */
  selectedTicket: PropTypes.shape({
    id: PropTypes.string.isRequired
  }),
  
  /**
   * Callback para abrir modal/tela de criação de solicitação.
   */
  onCreateRequest: PropTypes.func.isRequired,
  
  /**
   * Callback para atualizar/recarregar os dados.
   */
  onRefresh: PropTypes.func.isRequired
};

Dashboard.defaultProps = {
  allTickets: [],
  user: null,
  selectedTicket: null
};

// ============================================================================
// EXPORT
// ============================================================================

export default Dashboard;

/**
 * Exporta constantes para uso em testes ou outros componentes.
 */
export { 
  FILTER_TYPES, 
  CLOSED_STATUSES, 
  IN_PROGRESS_STATUSES,
  MAX_DISPLAYED_TICKETS,
  isClosedStatus,
  isInProgressStatus,
  getPriorityClass,
  getJiraTicketUrl
};