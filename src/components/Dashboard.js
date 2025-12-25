import React, { useState } from 'react';
import Card from './Card';
import Button from './Button';
import { formatDate, getPriorityColorClass } from '../api/jira';

function Dashboard({ allTickets, user, onTicketClick, selectedTicket, onCreateRequest, onRefresh }) {
  const [filter, setFilter] = useState('open'); // 'open' ou 'all'
  
  // Filter tickets for display
  const openTickets = allTickets.filter(ticket => 
    !ticket.fields.status?.name?.toLowerCase().includes('done') &&
    !ticket.fields.status?.name?.toLowerCase().includes('closed') &&
    !ticket.fields.status?.name?.toLowerCase().includes('resolved')
  );

  // Tickets to display based on filter
  const displayedTickets = filter === 'all' ? allTickets : openTickets;

  const openTicketInJira = (ticketKey) => {
    const jiraUrl = `https://${process.env.REACT_APP_JIRA_DOMAIN}/browse/${ticketKey}`;
    window.open(jiraUrl, '_blank');
  };

  return (
    <div className="dashboard-content">
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon open">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-number">{openTickets.length}</div>
            <div className="stat-label">Tickets Abertos</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon progress">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-number">
              {allTickets.filter(ticket => 
                ticket.fields.status?.name?.toLowerCase().includes('progress') ||
                ticket.fields.status?.name?.toLowerCase().includes('review') ||
                ticket.fields.status?.name?.toLowerCase().includes('development') ||
                ticket.fields.status?.name?.toLowerCase().includes('testing')
              ).length}
            </div>
            <div className="stat-label">Em Progresso</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon closed">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-number">
              {allTickets.filter(ticket => 
                ticket.fields.status?.name?.toLowerCase().includes('done') ||
                ticket.fields.status?.name?.toLowerCase().includes('closed') ||
                ticket.fields.status?.name?.toLowerCase().includes('resolved') ||
                ticket.fields.status?.name?.toLowerCase().includes('complete')
              ).length}
            </div>
            <div className="stat-label">Fechados</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon total">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
              <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2"/>
              <polyline points="10,9 9,9 8,9" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <div className="stat-content">
            <div className="stat-number">{allTickets.length}</div>
            <div className="stat-label">Total Criados</div>
          </div>
        </div>
      </div>

      {/* Recent Tickets Section */}
      <div className="tickets-section">
        <div className="section-header">
          <div className="section-header-left">
            <h2 className="section-title">Tickets Recentes</h2>
            <div className="filter-buttons">
              <button
                onClick={() => setFilter('open')}
                className={`filter-btn ${filter === 'open' ? 'active' : ''}`}
              >
                Abertos ({openTickets.length})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              >
                Todos ({allTickets.length})
              </button>
            </div>
          </div>
          <div className="section-header-right">
            <button 
              onClick={onCreateRequest}
              className="create-request-btn"
            >
              <span className="btn-icon">+</span>
              Criar Solicitação
            </button>
            
            <button 
              onClick={onRefresh}
              className="refresh-btn"
              title="Atualizar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M23 20V14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="tickets-list">
          {displayedTickets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎉</div>
              <h3 className="empty-title">
                {filter === 'open' ? 'Nenhum ticket aberto!' : 'Nenhum ticket encontrado!'}
              </h3>
              <p className="empty-description">
                {filter === 'open' 
                  ? 'Você ainda não criou nenhum ticket aberto.' 
                  : 'Não há tickets para exibir.'}
              </p>
            </div>
          ) : (
            displayedTickets.slice(0, 50).map((ticket) => (
              <div 
                key={ticket.id} 
                className={`ticket-card ${selectedTicket?.id === ticket.id ? 'expanded' : ''}`}
                onClick={() => onTicketClick(selectedTicket?.id === ticket.id ? null : ticket)}
              >
                <div className="ticket-header">
                  <div className="ticket-meta">
                    <span className="ticket-key">{ticket.key}</span>
                    <span className={`priority-badge ${ticket.fields.priority?.name?.toLowerCase() || 'medium'}`}>
                      {ticket.fields.priority?.name || 'Medium'}
                    </span>
                    <span className="status-badge">
                      {ticket.fields.status?.name}
                    </span>
                  </div>
                  
                  <div className="ticket-actions">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onTicketClick(ticket);
                      }}
                      className="show-details-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                      </svg>
                      Ver Detalhes
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        openTicketInJira(ticket.key);
                      }}
                      className="view-jira-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M7 7H17V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Abrir no Jira
                    </button>
                  </div>
                </div>
                
                <div className="ticket-content">
                  <h3 className="ticket-title">{ticket.fields.summary}</h3>
                  
                  <div className="ticket-details">
                    <span className="detail-item">
                      <strong>Projeto:</strong> {ticket.fields.project?.name}
                    </span>
                    <span className="detail-item">
                      <strong>Tipo:</strong> {ticket.fields.issuetype?.name}
                    </span>
                    <span className="detail-item">
                      <strong>Criado:</strong> {formatDate(ticket.fields.created)}
                    </span>
                  </div>
                </div>
                
                {/* Expanded details */}
                {selectedTicket?.id === ticket.id && (
                  <div className="ticket-expanded">
                    <div className="expanded-content">
                      <div className="expanded-grid">
                        <div className="expanded-item">
                          <strong>Responsável:</strong>
                          <span>{ticket.fields.assignee?.displayName || 'Não atribuído'}</span>
                        </div>
                        <div className="expanded-item">
                          <strong>Relator:</strong>
                          <span>{ticket.fields.reporter?.displayName || 'Desconhecido'}</span>
                        </div>
                        <div className="expanded-item">
                          <strong>Atualizado:</strong>
                          <span>{formatDate(ticket.fields.updated)}</span>
                        </div>
                        <div className="expanded-item">
                          <strong>Chave do Projeto:</strong>
                          <span>{ticket.fields.project?.key}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
