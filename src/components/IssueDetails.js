import React, { useState, useEffect, useCallback } from 'react';
import { 
  formatDate, 
  formatDateTime, 
  extractTextFromADF, 
  fetchTicketDetails,
  separateComments,
  addComment,
  fetchIssueTransitions,
  transitionIssue
} from '../api/jira';

function IssueDetails({ ticket, onClose, user }) {
  const [detailedTicket, setDetailedTicket] = useState(ticket);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Resolution Modal State
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionComment, setResolutionComment] = useState('');
  const [resolving, setResolving] = useState(false);

  const loadTicketDetails = useCallback(async () => {
    if (!ticket) return;
    
    try {
      setLoading(true);
      setError(null);
      const details = await fetchTicketDetails(ticket.key);
      setDetailedTicket(details);
    } catch (err) {
      console.error('Error loading ticket details:', err);
      setError(err.message);
      // Fall back to the basic ticket data
      setDetailedTicket(ticket);
    } finally {
      setLoading(false);
    }
  }, [ticket]);

  useEffect(() => {
    if (ticket) {
      loadTicketDetails();
    }
  }, [ticket, loadTicketDetails]);

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      setSubmitting(true);
      await addComment(ticket.key, commentText);
      setCommentText('');
      // Reload ticket details to show new comment
      await loadTicketDetails();
    } catch (err) {
      console.error('Error adding comment:', err);
      alert('Erro ao adicionar comentário: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* Status que indicam tickets fechados/resolvidos */
  const CLOSED_STATUSES = ['done', 'closed', 'resolved', 'complete', 'cancelled', 'resolvido', 'concluído', 'concluido', 'finalizado'];
  
  const isTicketClosed = () => {
    const statusName = detailedTicket?.fields?.status?.name?.toLowerCase();
    return statusName && CLOSED_STATUSES.includes(statusName);
  };

  const handleResolveClick = () => {
    setShowResolveModal(true);
  };

  const confirmResolution = async () => {
    if (!resolutionComment.trim()) {
      alert('Por favor, adicione um comentário de resolução.');
      return;
    }

    try {
      setResolving(true);
      
      // 1. Get available transitions
      const { transitions } = await fetchIssueTransitions(ticket.key);
      
      // 2. Find "Done", "Resolved" or "Concluído" transition
      const resolveTransition = transitions.find(t => 
        ['done', 'resolved', 'concluído', 'concluido', 'finalizar', 'resolver'].includes(t.name.toLowerCase()) ||
        t.to.statusCategory.key === 'done'
      );

      if (!resolveTransition) {
        throw new Error('Transição de resolução não encontrada para este ticket.');
      }

      // 3. Execute transition
      await transitionIssue(ticket.key, resolveTransition.id);
      
      // 4. Add resolution comment
      await addComment(ticket.key, `**RESOLUÇÃO:**\n${resolutionComment}`);

      // 5. Cleanup
      setResolutionComment('');
      setShowResolveModal(false);
      await loadTicketDetails();
    } catch (err) {
      console.error('Error resolving ticket:', err);
      alert('Erro ao resolver ticket: ' + err.message);
    } finally {
      setResolving(false);
    }
  };

  if (!ticket) return null;

  const openTicketInJira = () => {
    const jiraUrl = `https://${process.env.REACT_APP_JIRA_DOMAIN}/browse/${ticket.key}`;
    window.open(jiraUrl, '_blank');
  };

  // Extract description text from ADF format
  const getDescriptionText = () => {
    if (!detailedTicket?.fields?.description) return null;
    return extractTextFromADF(detailedTicket.fields.description);
  };

  // Get comments from the ticket
  const getComments = () => {
    if (!detailedTicket?.fields?.comment?.comments) return [];
    return detailedTicket.fields.comment.comments;
  };

  return (
    <div className="issue-details-overlay">
      <div className="issue-details-container">
        {/* Header */}
        <div className="issue-details-header">
          <div className="header-left">
            <h1 className="issue-title">{detailedTicket.fields.summary}</h1>
            <div className="issue-meta">
              <span className="issue-key">{detailedTicket.key}</span>
              <span className={`priority-badge ${detailedTicket.fields.priority?.name?.toLowerCase() || 'medium'}`}>
                {detailedTicket.fields.priority?.name || 'Medium'}
              </span>
              <span className="status-badge">
                {detailedTicket.fields.status?.name}
              </span>
            </div>
          </div>
          <div className="header-actions">
            {!isTicketClosed() && (
              <button 
                onClick={handleResolveClick}
                className="resolve-btn"
                title="Resolver Ticket"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.85999" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Resolver
              </button>
            )}
            <button 
              onClick={openTicketInJira}
              className="view-jira-btn"
              title="Abrir no Jira"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 17L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 7H17V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Abrir no Jira
            </button>
            <button 
              onClick={onClose}
              className="close-btn"
              title="Fechar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="issue-details-content">
          <div className="issue-details-grid">
            {/* Left Column */}
            <div className="issue-main-content">
              {loading && (
                <div className="loading-section">
                  <div className="loading-spinner-small"></div>
                  <p>Carregando detalhes do ticket...</p>
                </div>
              )}

              {error && (
                <div className="error-section">
                  <p className="error-message">Falha ao carregar informações detalhadas: {error}</p>
                </div>
              )}

              <div className="content-section">
                <h3 className="section-title">Descrição</h3>
                <div className="description-content">
                  {(() => {
                    const descriptionText = getDescriptionText();
                    if (descriptionText) {
                      return <pre className="description-text">{descriptionText}</pre>;
                    } else {
                      return <p className="no-description">Nenhuma descrição fornecida</p>;
                    }
                  })()}
                </div>
              </div>

              {/* Comments/Activity Section */}
              <div className="content-section">
                <h3 className="section-title">Comentários e Atividades</h3>
                
                {/* Novo Comentário */}
                <div className="new-comment-section">
                  <form onSubmit={handleCommentSubmit} className="comment-form">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Escreva um comentário..."
                      className="comment-textarea"
                      disabled={submitting}
                    />
                    <div className="comment-actions">
                      <button 
                        type="submit" 
                        className="submit-comment-btn"
                        disabled={!commentText.trim() || submitting}
                      >
                        {submitting ? 'Enviando...' : 'Comentar'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="activity-content">
                  {(() => {
                    const comments = getComments();
                    if (comments && comments.length > 0) {
                      const { internal, customer } = separateComments(comments);
                      
                      return (
                        <div className="comments-container">
                          {/* Customer Comments */}
                          {customer.length > 0 && (
                            <div className="comments-section">
                              <h4 className="comments-section-title">
                                <span className="comment-type-badge customer-badge">Cliente</span>
                                Comentários do Cliente ({customer.length})
                              </h4>
                              <div className="comments-list">
                                {customer.map((comment, index) => (
                                  <div key={comment.id || `customer-${index}`} className="comment-item customer-comment">
                                    <div className="comment-header">
                                      <div className="comment-author">
                                        <span className="author-name">
                                          {comment.author?.displayName || 'Usuário Desconhecido'}
                                        </span>
                                        <span className="comment-type-indicator">Cliente</span>
                                        <span className="comment-date">
                                          {formatDateTime(comment.created)}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="comment-body">
                                      <pre className="comment-text">
                                        {extractTextFromADF(comment.body)}
                                      </pre>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Internal Comments */}
                          {internal.length > 0 && (
                            <div className="comments-section">
                              <h4 className="comments-section-title">
                                <span className="comment-type-badge internal-badge">Interno</span>
                                Comentários Internos ({internal.length})
                              </h4>
                              <div className="comments-list">
                                {internal.map((comment, index) => (
                                  <div key={comment.id || `internal-${index}`} className="comment-item internal-comment">
                                    <div className="comment-header">
                                      <div className="comment-author">
                                        <span className="author-name">
                                          {comment.author?.displayName || 'Usuário Desconhecido'}
                                        </span>
                                        <span className="comment-type-indicator">Interno</span>
                                        <span className="comment-date">
                                          {formatDateTime(comment.created)}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="comment-body">
                                      <pre className="comment-text">
                                        {extractTextFromADF(comment.body)}
                                      </pre>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* No comments message */}
                          {customer.length === 0 && internal.length === 0 && (
                            <p className="no-activity">Nenhum comentário ou atividade</p>
                          )}
                        </div>
                      );
                    } else {
                      return <p className="no-activity">Nenhum comentário ou atividade</p>;
                    }
                  })()}
                </div>
              </div>
            </div>

            {/* Right Column - Details */}
            <div className="issue-sidebar">
              <div className="sidebar-section">
                <h4 className="sidebar-title">Detalhes</h4>
                <div className="details-list">
                  <div className="detail-row">
                    <span className="detail-label">Tipo:</span>
                    <span className="detail-value">
                      <span className="issue-type">
                        {detailedTicket.fields.issuetype?.name}
                      </span>
                    </span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Projeto:</span>
                    <span className="detail-value">{detailedTicket.fields.project?.name}</span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Chave do Projeto:</span>
                    <span className="detail-value">{detailedTicket.fields.project?.key}</span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Responsável:</span>
                    <span className="detail-value">
                      {detailedTicket.fields.assignee ? (
                        <div className="user-info">
                          <span className="user-name">{detailedTicket.fields.assignee.displayName}</span>
                          <span className="user-email">{detailedTicket.fields.assignee.emailAddress}</span>
                        </div>
                      ) : (
                        <span className="unassigned">Não atribuído</span>
                      )}
                    </span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Relator:</span>
                    <span className="detail-value">
                      {detailedTicket.fields.reporter ? (
                        <div className="user-info">
                          <span className="user-name">{detailedTicket.fields.reporter.displayName}</span>
                          <span className="user-email">{detailedTicket.fields.reporter.emailAddress}</span>
                        </div>
                      ) : (
                        <span className="unknown-user">Desconhecido</span>
                      )}
                    </span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Criado:</span>
                    <span className="detail-value">{formatDate(detailedTicket.fields.created)}</span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Atualizado:</span>
                    <span className="detail-value">{formatDate(detailedTicket.fields.updated)}</span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Data de Vencimento:</span>
                    <span className="detail-value">
                      {detailedTicket.fields.duedate ? (
                        (() => {
                          const dueDate = new Date(detailedTicket.fields.duedate);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const isOverdue = dueDate < today;
                          const isToday = dueDate.getTime() === today.getTime();
                          
                          return (
                            <div className="due-date-info">
                              <span className={isOverdue ? 'due-date overdue' : isToday ? 'due-date today' : 'due-date'}>
                                {formatDate(detailedTicket.fields.duedate)}
                              </span>
                              {isOverdue && (
                                <span className="overdue-badge">Vencida</span>
                              )}
                              {isToday && !isOverdue && (
                                <span className="today-badge">Hoje</span>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="no-due-date">Não definida</span>
                      )}
                    </span>
                  </div>
                  
                  {detailedTicket.fields.resolution && (
                    <div className="detail-row">
                      <span className="detail-label">Resolução:</span>
                      <span className="detail-value">{detailedTicket.fields.resolution.name}</span>
                    </div>
                  )}

                  {/* Labels */}
                  {detailedTicket.fields.labels && detailedTicket.fields.labels.length > 0 && (
                    <div className="detail-row">
                      <span className="detail-label">Etiquetas:</span>
                      <div className="detail-value">
                        <div className="labels-list">
                          {detailedTicket.fields.labels.map((label, index) => (
                            <span key={index} className="label-tag">{label}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Components */}
                  {detailedTicket.fields.components && detailedTicket.fields.components.length > 0 && (
                    <div className="detail-row">
                      <span className="detail-label">Componentes:</span>
                      <div className="detail-value">
                        <div className="components-list">
                          {detailedTicket.fields.components.map((component, index) => (
                            <span key={index} className="component-tag">{component.name}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resolution Modal */}
      {showResolveModal && (
        <div className="modal-overlay">
          <div className="modal-content resolution-modal">
            <div className="modal-header">
              <h3 className="modal-title">Resolver Ticket</h3>
              <button 
                className="close-modal-btn"
                onClick={() => setShowResolveModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-description">
                Descreva a solução aplicada para encerrar este ticket.
              </p>
              <textarea
                value={resolutionComment}
                onChange={(e) => setResolutionComment(e.target.value)}
                placeholder="Ex: O problema foi corrigido reiniciando o serviço..."
                className="modal-textarea"
                rows={5}
                disabled={resolving}
              />
            </div>
            <div className="modal-footer">
              <button 
                className="modal-cancel-btn"
                onClick={() => setShowResolveModal(false)}
                disabled={resolving}
              >
                Cancelar
              </button>
              <button 
                className="modal-confirm-btn"
                onClick={confirmResolution}
                disabled={!resolutionComment.trim() || resolving}
              >
                {resolving ? 'Resolvendo...' : 'Confirmar Resolução'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IssueDetails;
