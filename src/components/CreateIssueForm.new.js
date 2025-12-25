import React, { useState, useEffect } from 'react';
import Layout from './Layout';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3003/api';

const CreateIssueForm = ({ onClose, onSuccess, user }) => {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [issueTypes, setIssueTypes] = useState([]);
  const [formData, setFormData] = useState({
    projectId: '',
    issueTypeId: '',
    summary: '',
    description: '',
    priority: '3'
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (formData.projectId) {
      loadIssueTypes(formData.projectId);
    }
  }, [formData.projectId]);

  const loadProjects = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/projects`);
      if (response.ok) {
        const projectsData = await response.json();
        setProjects(projectsData);
        if (projectsData.length > 0) {
          setFormData(prev => ({ ...prev, projectId: projectsData[0].id }));
        }
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  const loadIssueTypes = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/issuetypes`);
      if (response.ok) {
        const typesData = await response.json();
        setIssueTypes(typesData);
        if (typesData.length > 0) {
          setFormData(prev => ({ ...prev, issueTypeId: typesData[0].id }));
        }
      }
    } catch (err) {
      console.error('Error loading issue types:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const issueData = {
        fields: {
          project: { id: formData.projectId },
          issuetype: { id: formData.issueTypeId },
          summary: formData.summary,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: formData.description || "Nenhuma descrição fornecida."
                  }
                ]
              }
            ]
          },
          priority: { id: formData.priority }
        }
      };

      const response = await fetch(`${API_BASE_URL}/issues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(issueData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Issue created:', result);
        onSuccess();
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Error creating issue:', errorData);
        setError(errorData.message || 'Falha ao criar solicitação');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Falha ao criar solicitação. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <Layout user={user}>
      <div className="create-issue-container">
        <div className="create-issue-header">
          <div className="header-left">
            <h1 className="page-title">Criar uma Solicitação</h1>
            {user && (
              <p className="user-subtitle">
                Criando como {user.displayName} ({user.emailAddress})
              </p>
            )}
          </div>
          <button 
            onClick={onClose} 
            className="back-to-dashboard-btn"
          >
            ← Voltar ao Painel
          </button>
        </div>

        <div className="create-issue-form">
          <form onSubmit={handleSubmit} className="form-content">
            {error && (
              <div className="error-alert">
                <p className="error-text">{error}</p>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="projectId" className="form-label">
                  Projeto *
                </label>
                <select
                  id="projectId"
                  name="projectId"
                  value={formData.projectId}
                  onChange={handleInputChange}
                  required
                  className="form-select"
                >
                  <option value="">Selecione um projeto</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.key})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="issueTypeId" className="form-label">
                  Tipo de Solicitação *
                </label>
                <select
                  id="issueTypeId"
                  name="issueTypeId"
                  value={formData.issueTypeId}
                  onChange={handleInputChange}
                  required
                  disabled={!formData.projectId}
                  className="form-select"
                >
                  <option value="">Selecione um tipo de solicitação</option>
                  {issueTypes.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="priority" className="form-label">
                  Prioridade
                </label>
                <select
                  id="priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  <option value="1">Máxima</option>
                  <option value="2">Alta</option>
                  <option value="3">Média</option>
                  <option value="4">Baixa</option>
                  <option value="5">Mínima</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="summary" className="form-label">
                Resumo *
              </label>
              <input
                type="text"
                id="summary"
                name="summary"
                value={formData.summary}
                onChange={handleInputChange}
                required
                placeholder="Resumo breve da sua solicitação"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description" className="form-label">
                Descrição
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={6}
                placeholder="Forneça mais detalhes sobre sua solicitação..."
                className="form-textarea"
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={onClose}
                className="cancel-btn"
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                {loading ? 'Criando...' : 'Criar Solicitação'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default CreateIssueForm;
