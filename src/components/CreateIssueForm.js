import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : (process.env.REACT_APP_API_URL || 'http://localhost:3003') + '/api';

const CreateIssueForm = ({ onClose, onSuccess, user, selectedUser }) => {
  const { user: authUser } = useAuth(); // Usuário autenticado do Supabase
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [projects, setProjects] = useState([]);
  const [issueTypes, setIssueTypes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [formData, setFormData] = useState({
    projectId: '',
    projectKey: '',
    issueTypeId: '',
    summary: '',
    description: '',
    priority: '3', // Medium priority by default
    reporterEmail: ''
  });
  const [error, setError] = useState(null);
  const [reporterInput, setReporterInput] = useState('');
  const [showReporterSuggestions, setShowReporterSuggestions] = useState(false);
  const [filteredCustomers, setFilteredCustomers] = useState([]);

  useEffect(() => {
    loadProjects();
    loadCustomers();
  }, []);

  useEffect(() => {
    if (formData.projectId) {
      loadIssueTypes(formData.projectId);
    }
  }, [formData.projectId]);

  useEffect(() => {
    // Inicializar o campo de email do relator com o email do usuário autenticado
    // Se encontrar um customer correspondente, usar o accountId
    if (authUser?.email && !formData.reporterEmail) {
      if (customers.length > 0) {
        const matchingCustomer = customers.find(c => 
          c.emailAddress?.toLowerCase() === authUser.email?.toLowerCase()
        );
        if (matchingCustomer) {
          const customerValue = matchingCustomer.accountId || matchingCustomer.emailAddress;
          setFormData(prev => ({ ...prev, reporterEmail: customerValue }));
          setReporterInput(matchingCustomer.displayName 
            ? `${matchingCustomer.displayName} (${matchingCustomer.emailAddress})`
            : matchingCustomer.emailAddress);
        } else {
          // Se não encontrar o customer na lista, usar o email como fallback
          setFormData(prev => ({ ...prev, reporterEmail: authUser.email }));
          setReporterInput(authUser.email);
        }
      } else {
        // Enquanto os customers não são carregados, usar o email do usuário
        setFormData(prev => ({ ...prev, reporterEmail: authUser.email }));
        setReporterInput(authUser.email);
      }
    }
  }, [authUser?.email, customers]);

  // Filtrar customers baseado no input do relator
  useEffect(() => {
    if (!reporterInput.trim()) {
      setFilteredCustomers(customers);
      return;
    }

    const searchTerm = reporterInput.toLowerCase();
    const filtered = customers.filter(customer => {
      const displayName = (customer.displayName || '').toLowerCase();
      const email = (customer.emailAddress || '').toLowerCase();
      return displayName.includes(searchTerm) || email.includes(searchTerm);
    });
    setFilteredCustomers(filtered);
  }, [reporterInput, customers]);

  const loadProjects = async () => {
    try {
      setLoadingProjects(true);
      const response = await fetch(`${API_BASE_URL}/projects`);
      if (response.ok) {
        const result = await response.json();
        // A API pode retornar { values: [...] } ou array direto
        const projectsData = result.values || result || [];
        
        console.log('[CreateIssueForm] Projetos carregados:', projectsData);
        
        // Buscar projeto SUP - tentar várias variações
        const suporteProject = projectsData.find(p => {
          const key = (p.key || '').toUpperCase();
          const name = (p.name || '').toUpperCase();
          return key === 'SUP' || 
                 key === 'SUPORTE' || 
                 name.includes('SUPORTE') || 
                 name.includes('SUP') ||
                 key.includes('SUP');
        });
        
        if (suporteProject) {
          console.log('[CreateIssueForm] Projeto SUP encontrado:', suporteProject);
          setProjects([suporteProject]);
          // Guardar tanto o id quanto a key para usar no submit
          const projectId = suporteProject.projectId || suporteProject.id;
          const projectKey = suporteProject.key;
          setFormData(prev => ({ 
            ...prev, 
            projectId,
            projectKey 
          }));
          } else {
          console.warn('[CreateIssueForm] Projeto SUP não encontrado. Projetos disponíveis:', 
            projectsData.map(p => `${p.key} - ${p.name}`));
          // Se SUP não encontrado, mostrar todos mas tentar selecionar o primeiro
          setProjects(projectsData);
          if (projectsData.length > 0) {
            const firstProject = projectsData[0];
            const projectId = firstProject.projectId || firstProject.id;
            const projectKey = firstProject.key;
            setFormData(prev => ({ 
              ...prev, 
              projectId,
              projectKey 
            }));
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error loading projects:', errorData);
        setError('Falha ao carregar projetos. Por favor, tente novamente.');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Erro ao carregar projetos: ' + err.message);
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadIssueTypes = async (projectId) => {
    if (!projectId) return;
    
    try {
      // Não usar setLoading aqui para não bloquear o formulário
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/issuetypes`);
      if (response.ok) {
        const typesData = await response.json();
        console.log('[CreateIssueForm] Tipos de issue carregados:', typesData);
        setIssueTypes(typesData);
        if (typesData.length > 0) {
          // Usar id ou issueTypeId dependendo da estrutura
          const firstTypeId = typesData[0].id || typesData[0].issueTypeId;
          setFormData(prev => ({ ...prev, issueTypeId: firstTypeId }));
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error loading issue types:', errorData);
        setError('Falha ao carregar tipos de solicitação.');
      }
    } catch (err) {
      console.error('Error loading issue types:', err);
      setError('Erro ao carregar tipos de solicitação: ' + err.message);
    }
  };

  const loadCustomers = async () => {
    try {
      setLoadingCustomers(true);
      // Buscar todos os usuários do Jira (sem query para obter mais resultados)
      const response = await fetch(`${API_BASE_URL}/user/search?maxResults=1000`);
      if (response.ok) {
        const customersData = await response.json();
        console.log('[CreateIssueForm] Customers carregados:', customersData.length);
        
        // Filtrar customers removendo aqueles com email N/A ou inválido
        const validCustomers = (customersData || []).filter(customer => {
          const email = customer.emailAddress;
          return email && 
                 email.trim() !== '' && 
                 email.toLowerCase() !== 'n/a' && 
                 email.includes('@'); // Garantir que tem formato de email válido
        });
        
        // Ordenar por displayName para facilitar a busca
        const sortedCustomers = validCustomers.sort((a, b) => {
          const nameA = (a.displayName || a.emailAddress || '').toLowerCase();
          const nameB = (b.displayName || b.emailAddress || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        
        setCustomers(sortedCustomers);
        setFilteredCustomers(sortedCustomers);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error loading customers:', errorData);
        // Não mostrar erro para o usuário, apenas log
      }
    } catch (err) {
      console.error('Error loading customers:', err);
      // Não mostrar erro para o usuário, apenas log
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Função para converter email em label válida para Jira
      const emailToLabel = (email, prefix = 'req') => {
        if (!email) return '';
        const namePart = email.split('@')[0]; // pega apenas o nome antes do @
        const sanitized = namePart.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        return `${prefix}-${sanitized}`;
      };

      // Criar labels baseadas no email do usuário
      const userLabels = [];
      if (authUser?.email) {
        const reqLabel = emailToLabel(authUser.email, 'req');
        if (reqLabel) userLabels.push(reqLabel);
        console.log('[CreateIssueForm] Labels criadas para o usuário:', userLabels, 'Email:', authUser.email);
      }

      // Formato esperado pelo servidor: objeto com "fields"
      // A API do Jira aceita project por key ou id, e issuetype por id ou name
      const issueData = {
        fields: {
          // Usar key do projeto (mais confiável) ou id como fallback
          project: formData.projectKey 
            ? { key: formData.projectKey }
            : { id: formData.projectId },
          // Usar id do tipo de issue
          issuetype: {
            id: formData.issueTypeId
          },
          summary: formData.summary,
          description: formData.description || formData.summary,
          // Priority pode ser id (1-5) ou objeto { id: "..." }
          priority: {
            id: formData.priority
          },
          // Reporter (relator) - usar accountId ou emailAddress do customer selecionado, senão usar email do usuário autenticado
          // Se o reporterInput contém um email válido mas formData.reporterEmail está vazio, usar o input
          ...((formData.reporterEmail?.trim() || (reporterInput.includes('@') ? reporterInput.trim() : '') || authUser?.email)
            ? { 
                reporter: formData.reporterEmail?.trim() || (reporterInput.includes('@') ? reporterInput.trim() : '') || authUser.email
              }
            : {}),
          // Labels para identificar tickets do usuário
          ...(userLabels.length > 0 
            ? { labels: userLabels }
            : {})
        }
      };

      console.log('[CreateIssueForm] Enviando dados:', issueData);

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
        setError(errorData.error || 'Falha ao criar solicitação');
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
    
    // Se for mudança de projeto, atualizar também a key
    if (name === 'projectId') {
      const selectedOption = e.target.options[e.target.selectedIndex];
      const projectKey = selectedOption?.getAttribute('data-key') || '';
      const selectedProject = projects.find(p => {
        const pid = p.projectId || p.id;
        return pid === value;
      });
      const finalKey = projectKey || selectedProject?.key || '';
      
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        projectKey: finalKey
      }));
    } else if (name === 'reporterEmail') {
      // Para o campo de relator, atualizar o input e mostrar sugestões
      setReporterInput(value);
      setShowReporterSuggestions(true);
      
      // Se o valor parece ser um email válido (contém @), usar diretamente
      if (value.includes('@') && value.trim()) {
        setFormData(prev => ({ ...prev, reporterEmail: value.trim() }));
      } else if (!value.trim()) {
        // Se o valor estiver vazio, limpar também o formData
        setFormData(prev => ({ ...prev, reporterEmail: '' }));
      }
      // Se não for email válido mas tem texto, manter o input mas não atualizar formData ainda
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleReporterSelect = (customer) => {
    const customerValue = customer.accountId || customer.emailAddress;
    const displayText = customer.displayName 
      ? `${customer.displayName} (${customer.emailAddress})`
      : customer.emailAddress;
    
    setReporterInput(displayText);
    setFormData(prev => ({ ...prev, reporterEmail: customerValue }));
    setShowReporterSuggestions(false);
  };

  const handleReporterBlur = () => {
    // Aguardar um pouco antes de esconder para permitir clique na sugestão
    setTimeout(() => {
      setShowReporterSuggestions(false);
    }, 200);
  };

  return (
    <Layout user={user}>
      <div className="create-issue-container">
        {/* Header */}
        <div className="create-issue-header">
          <div className="header-left">
            <h1 className="page-title">Criar uma Solicitação</h1>
            <p className="user-subtitle">
              Criando solicitação como: {authUser?.user_metadata?.full_name || authUser?.email || 'Usuário'} ({authUser?.email || 'N/A'})
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="back-to-dashboard-btn"
          >
            ← Voltar ao Painel
          </button>
        </div>

        {/* Form */}
        <div className="create-issue-form">
          <form onSubmit={handleSubmit} className="form-content">
            {error && (
              <div className="error-alert">
                <p className="error-text">{error}</p>
              </div>
            )}

            {/* Seção: Informações Básicas */}
            <div className="form-section">
              <h3 className="form-section-title">Informações Básicas</h3>
              <div className="form-grid">
                {/* Project Selection - Fixed to SUPORTE project */}
                {projects.length > 1 ? (
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
                      {projects.map(project => {
                        const projectId = project.projectId || project.id;
                        return (
                          <option key={projectId} value={projectId}>
                            {project.name} ({project.key})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : projects.length === 1 ? (
                  <div className="form-group">
                    <label htmlFor="projectDisplay" className="form-label">
                      Projeto
                    </label>
                    <input
                      type="text"
                      id="projectDisplay"
                      value={`${projects[0].name} (${projects[0].key})`}
                      disabled
                      className="form-input"
                    />
                  </div>
                ) : (
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
                      disabled
                    >
                      <option value="">{loadingProjects ? 'Carregando projetos...' : 'Nenhum projeto encontrado'}</option>
                    </select>
                  </div>
                )}

                {/* Issue Type Selection */}
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
                    {issueTypes.map(type => {
                      const typeId = type.id || type.issueTypeId;
                      return (
                        <option key={typeId} value={typeId}>
                          {type.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* Seção: Configurações Adicionais */}
            <div className="form-section">
              <h3 className="form-section-title">Configurações Adicionais</h3>
              <div className="form-grid">
                {/* Priority */}
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

                {/* Reporter Email - Customer Selection with Autocomplete */}
                <div className="form-group">
                  <label htmlFor="reporterEmail" className="form-label">
                    Relator (Customer)
                  </label>
                  <div className="autocomplete-wrapper">
                    <input
                      type="text"
                      id="reporterEmail"
                      name="reporterEmail"
                      value={reporterInput}
                      onChange={handleInputChange}
                      onFocus={() => setShowReporterSuggestions(true)}
                      onBlur={handleReporterBlur}
                      placeholder={loadingCustomers ? 'Carregando customers...' : 'Digite para buscar um customer...'}
                      className="form-input"
                      disabled={loadingCustomers}
                      autoComplete="off"
                    />
                    {showReporterSuggestions && filteredCustomers.length > 0 && (
                      <div className="autocomplete-dropdown">
                        {filteredCustomers.slice(0, 10).map(customer => {
                          const displayText = customer.displayName 
                            ? `${customer.displayName} (${customer.emailAddress})`
                            : customer.emailAddress;
                          return (
                            <div
                              key={customer.accountId || customer.emailAddress}
                              className="autocomplete-option"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleReporterSelect(customer);
                              }}
                            >
                              <div className="autocomplete-option-name">{customer.displayName || customer.emailAddress}</div>
                              <div className="autocomplete-option-email">{customer.emailAddress}</div>
                            </div>
                          );
                        })}
                        {filteredCustomers.length > 10 && (
                          <div className="autocomplete-more">
                            +{filteredCustomers.length - 10} mais resultados
                          </div>
                        )}
                      </div>
                    )}
                    {!loadingCustomers && customers.length === 0 && (
                      <small className="form-hint">
                        Nenhum customer encontrado. O sistema usará seu email automaticamente.
                      </small>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Seção: Descrição da Solicitação */}
            <div className="form-section">
              <h3 className="form-section-title">Descrição da Solicitação</h3>
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
            </div>

            {/* Submit Buttons */}
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
