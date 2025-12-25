import React, { useState, useEffect } from 'react';
import { formatDate, getPriorityColorClass } from '../api/jira';

function TicketsPage({ allTickets, user, onTicketClick, selectedTicket, onCreateRequest, onRefresh }) {
  const [filter, setFilter] = useState('all'); // 'all', 'open', 'in-progress', 'closed', 'no-labels'
  const [sortBy, setSortBy] = useState('created'); // 'created', 'priority', 'updated'

  const openTicketInJira = (ticketKey) => {
    const jiraUrl = `https://${process.env.REACT_APP_JIRA_DOMAIN}/browse/${ticketKey}`;
    window.open(jiraUrl, '_blank');
  };

  // Filter tickets based on selected filter
  const getFilteredTickets = () => {
    let filtered = [...allTickets];

    switch (filter) {
      case 'open':
        filtered = filtered.filter(ticket => 
          !ticket.fields.status?.name?.toLowerCase().includes('done') &&
          !ticket.fields.status?.name?.toLowerCase().includes('closed') &&
          !ticket.fields.status?.name?.toLowerCase().includes('resolved')
        );
        break;
      case 'in-progress':
        filtered = filtered.filter(ticket => 
          ticket.fields.status?.name?.toLowerCase().includes('progress') ||
          ticket.fields.status?.name?.toLowerCase().includes('review') ||
          ticket.fields.status?.name?.toLowerCase().includes('development') ||
          ticket.fields.status?.name?.toLowerCase().includes('testing')
        );
        break;
      case 'closed':
        filtered = filtered.filter(ticket => 
          ticket.fields.status?.name?.toLowerCase().includes('done') ||
          ticket.fields.status?.name?.toLowerCase().includes('closed') ||
          ticket.fields.status?.name?.toLowerCase().includes('resolved') ||
          ticket.fields.status?.name?.toLowerCase().includes('complete')
        );
        break;
      case 'no-labels':
        filtered = filtered.filter(ticket => {
          const labels = ticket.fields?.labels;
          const hasNoLabels = !labels || (Array.isArray(labels) && labels.length === 0);
          return hasNoLabels;
        });
        break;
      default:
        // 'all' - no filtering
        break;
    }

    // Sort tickets
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { 'Highest': 4, 'High': 3, 'Medium': 2, 'Low': 1, 'Lowest': 0 };
          const aPriority = priorityOrder[a.fields.priority?.name] || 0;
          const bPriority = priorityOrder[b.fields.priority?.name] || 0;
          return bPriority - aPriority;
        case 'updated':
          return new Date(b.fields.updated) - new Date(a.fields.updated);
        case 'created':
        default:
          return new Date(b.fields.created) - new Date(a.fields.created);
      }
    });

    return filtered;
  };

  const filteredTickets = getFilteredTickets();

  const getStatusColor = (statusName) => {
    const status = statusName?.toLowerCase() || '';
    if (status.includes('done') || status.includes('closed') || status.includes('resolved')) {
      return 'status-closed';
    } else if (status.includes('progress') || status.includes('review') || status.includes('development')) {
      return 'status-progress';
    }
    return 'status-open';
  };

  return (
    <div className="tickets-page-content">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">All Tickets</h1>
          <p className="page-subtitle">View and manage all your service requests</p>
        </div>
        <div className="page-header-right">
          <button 
            onClick={onCreateRequest}
            className="create-request-btn"
          >
            <span className="btn-icon">+</span>
            Create Request
          </button>
          <button 
            onClick={onRefresh}
            className="refresh-btn"
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M23 20V14H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="tickets-controls">
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({allTickets.length})
          </button>
          <button 
            className={`filter-btn ${filter === 'open' ? 'active' : ''}`}
            onClick={() => setFilter('open')}
          >
            Open ({allTickets.filter(t => 
              !t.fields.status?.name?.toLowerCase().includes('done') &&
              !t.fields.status?.name?.toLowerCase().includes('closed') &&
              !t.fields.status?.name?.toLowerCase().includes('resolved')
            ).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'in-progress' ? 'active' : ''}`}
            onClick={() => setFilter('in-progress')}
          >
            In Progress ({allTickets.filter(t => 
              t.fields.status?.name?.toLowerCase().includes('progress') ||
              t.fields.status?.name?.toLowerCase().includes('review') ||
              t.fields.status?.name?.toLowerCase().includes('development') ||
              t.fields.status?.name?.toLowerCase().includes('testing')
            ).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'closed' ? 'active' : ''}`}
            onClick={() => setFilter('closed')}
          >
            Closed ({allTickets.filter(t => 
              t.fields.status?.name?.toLowerCase().includes('done') ||
              t.fields.status?.name?.toLowerCase().includes('closed') ||
              t.fields.status?.name?.toLowerCase().includes('resolved')
            ).length})
          </button>
          <button 
            className={`filter-btn ${filter === 'no-labels' ? 'active' : ''}`}
            onClick={() => setFilter('no-labels')}
          >
            Sem Labels ({allTickets.filter(t => {
              const labels = t.fields?.labels;
              return !labels || (Array.isArray(labels) && labels.length === 0);
            }).length})
          </button>
        </div>

        <div className="sort-controls">
          <label htmlFor="sort-select">Sort by:</label>
          <select 
            id="sort-select"
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="created">Created Date</option>
            <option value="updated">Last Updated</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div className="tickets-list-full">
        {filteredTickets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3 className="empty-title">No tickets found</h3>
            <p className="empty-description">
              {filter === 'all' 
                ? "You haven't created any tickets yet."
                : filter === 'no-labels'
                ? "No tickets without labels found."
                : `No ${filter.replace('-', ' ')} tickets found.`
              }
            </p>
            {filter !== 'all' && (
              <button 
                onClick={() => setFilter('all')}
                className="empty-action-btn"
              >
                View All Tickets
              </button>
            )}
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div 
              key={ticket.id} 
              className={`ticket-card-full ${selectedTicket?.id === ticket.id ? 'expanded' : ''}`}
              onClick={() => onTicketClick(selectedTicket?.id === ticket.id ? null : ticket)}
            >
              <div className="ticket-header">
                <div className="ticket-meta">
                  <span className="ticket-key">{ticket.key}</span>
                  <span className={`priority-badge ${ticket.fields.priority?.name?.toLowerCase() || 'medium'}`}>
                    {ticket.fields.priority?.name || 'Medium'}
                  </span>
                  <span className={`status-badge ${getStatusColor(ticket.fields.status?.name)}`}>
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
                    Show Details
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
                    Open in Jira
                  </button>
                </div>
              </div>
              
              <div className="ticket-content">
                <h3 className="ticket-title">{ticket.fields.summary}</h3>
                
                <div className="ticket-details">
                  <span className="detail-item">
                    <strong>Project:</strong> {ticket.fields.project?.name}
                  </span>
                  <span className="detail-item">
                    <strong>Type:</strong> {ticket.fields.issuetype?.name}
                  </span>
                  <span className="detail-item">
                    <strong>Created:</strong> {formatDate(ticket.fields.created)}
                  </span>
                  <span className="detail-item">
                    <strong>Updated:</strong> {formatDate(ticket.fields.updated)}
                  </span>
                  {ticket.fields.assignee && (
                    <span className="detail-item">
                      <strong>Assignee:</strong> {ticket.fields.assignee.displayName}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {selectedTicket?.id === ticket.id && (
                <div className="ticket-expanded">
                  <div className="expanded-content">
                    <div className="expanded-grid">
                      <div className="expanded-item">
                        <strong>Reporter:</strong>
                        <span>{ticket.fields.reporter?.displayName || 'Unknown'}</span>
                      </div>
                      <div className="expanded-item">
                        <strong>Project Key:</strong>
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
  );
}

export default TicketsPage;
