import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Chave Aleatória' }
];

const PixSettingsForm = ({ estacionamentoId, initialData, onSuccess }) => {
  const [formData, setFormData] = useState({
    pix_key: '',
    pix_key_type: 'cpf',
    pix_key_owner_name: '',
    pix_key_owner_document: '',
    pix_bank_name: '',
    pix_bank_ispb: '',
    ...initialData
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Limpar erro do campo ao modificar
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.pix_key) {
      newErrors.pix_key = 'A chave PIX é obrigatória';
    }
    
    if (!formData.pix_key_owner_name) {
      newErrors.pix_key_owner_name = 'O nome do titular é obrigatório';
    }
    
    if (!formData.pix_key_owner_document) {
      newErrors.pix_key_owner_document = 'O CPF/CNPJ do titular é obrigatório';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Você precisa estar logado para atualizar as configurações');
      }
      
      const response = await axios.put(
        `/api/estacionamentos/${estacionamentoId}/payment-config`,
        formData,
        {
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      toast.success('Configurações de PIX atualizadas com sucesso!');
      
      if (onSuccess) {
        onSuccess(response.data.data);
      }
    } catch (error) {
      console.error('Erro ao atualizar configurações de PIX:', error);
      const errorMessage = error.response?.data?.message || 'Erro ao atualizar configurações';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDocument = (value, type) => {
    if (!value) return '';
    
    const numericValue = value.replace(/\D/g, '');
    
    if (type === 'cpf') {
      return numericValue
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(\-\d{2})\d+?$/, '$1');
    } else if (type === 'cnpj') {
      return numericValue
        .slice(0, 14)
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    }
    
    return value;
  };

  const handleDocumentChange = (e) => {
    const { name, value } = e.target;
    const numericValue = value.replace(/\D/g, '');
    
    setFormData(prev => ({
      ...prev,
      [name]: numericValue
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
        <div className="md:grid md:grid-cols-3 md:gap-6">
          <div className="md:col-span-1">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Configurações de PIX</h3>
            <p className="mt-1 text-sm text-gray-500">
              Configure os dados para recebimento via PIX no seu estacionamento.
            </p>
          </div>
          <div className="mt-5 md:mt-0 md:col-span-2">
            <div className="space-y-6">
              <div>
                <label htmlFor="pix_key_type" className="block text-sm font-medium text-gray-700">
                  Tipo de Chave PIX
                </label>
                <select
                  id="pix_key_type"
                  name="pix_key_type"
                  value={formData.pix_key_type}
                  onChange={handleChange}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                >
                  {PIX_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pix_key" className="block text-sm font-medium text-gray-700">
                  Chave PIX
                </label>
                <input
                  type="text"
                  name="pix_key"
                  id="pix_key"
                  value={formData.pix_key}
                  onChange={handleChange}
                  className={`mt-1 block w-full border ${errors.pix_key ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                  placeholder={formData.pix_key_type === 'email' ? 'seu@email.com' : 
                               formData.pix_key_type === 'phone' ? '(00) 00000-0000' : 
                               formData.pix_key_type === 'cpf' ? '000.000.000-00' :
                               formData.pix_key_type === 'cnpj' ? '00.000.000/0000-00' :
                               'Sua chave PIX'}
                />
                {errors.pix_key && (
                  <p className="mt-2 text-sm text-red-600">{errors.pix_key}</p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  {formData.pix_key_type === 'cpf' ? 'Informe o CPF (apenas números)' :
                   formData.pix_key_type === 'cnpj' ? 'Informe o CNPJ (apenas números)' :
                   formData.pix_key_type === 'email' ? 'Informe um e-mail válido' :
                   formData.pix_key_type === 'phone' ? 'Informe o telefone com DDD (apenas números)' :
                   'Informe a chave aleatória (ex: 123e4567-e12b-12d1-a456-426655440000)'}
                </p>
              </div>

              <div>
                <label htmlFor="pix_key_owner_name" className="block text-sm font-medium text-gray-700">
                  Nome do Titular da Chave
                </label>
                <input
                  type="text"
                  name="pix_key_owner_name"
                  id="pix_key_owner_name"
                  value={formData.pix_key_owner_name}
                  onChange={handleChange}
                  className={`mt-1 block w-full border ${errors.pix_key_owner_name ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                  placeholder="Nome completo ou Razão Social"
                />
                {errors.pix_key_owner_name && (
                  <p className="mt-2 text-sm text-red-600">{errors.pix_key_owner_name}</p>
                )}
              </div>

              <div>
                <label htmlFor="pix_key_owner_document" className="block text-sm font-medium text-gray-700">
                  CPF/CNPJ do Titular
                </label>
                <input
                  type="text"
                  name="pix_key_owner_document"
                  id="pix_key_owner_document"
                  value={formatDocument(formData.pix_key_owner_document, formData.pix_key_owner_document?.length > 11 ? 'cnpj' : 'cpf')}
                  onChange={handleDocumentChange}
                  className={`mt-1 block w-full border ${errors.pix_key_owner_document ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
                {errors.pix_key_owner_document && (
                  <p className="mt-2 text-sm text-red-600">{errors.pix_key_owner_document}</p>
                )}
              </div>

              <div>
                <label htmlFor="pix_bank_name" className="block text-sm font-medium text-gray-700">
                  Nome do Banco (Opcional)
                </label>
                <input
                  type="text"
                  name="pix_bank_name"
                  id="pix_bank_name"
                  value={formData.pix_bank_name || ''}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Ex: Nubank, Itaú, Bradesco..."
                />
              </div>

              <div>
                <label htmlFor="pix_bank_ispb" className="block text-sm font-medium text-gray-700">
                  Código ISPB do Banco (Opcional)
                </label>
                <input
                  type="text"
                  name="pix_bank_ispb"
                  id="pix_bank_ispb"
                  value={formData.pix_bank_ispb || ''}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Código de 8 dígitos"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Código de 8 dígitos que identifica o banco no sistema financeiro. Ex: 182 (Nubank), 607 (Itaú), 077 (Inter)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </form>
  );
};

export default PixSettingsForm;
