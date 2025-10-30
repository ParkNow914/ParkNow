import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PixConfirmationPanel from './PixConfirmationPanel';

const STATUS_LABELS = {
  pendente_pagamento: 'Aguardando Pagamento',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  concluida: 'Concluída',
  expirada: 'Expirada',
  em_andamento: 'Em Andamento'
};

const STATUS_COLORS = {
  pendente_pagamento: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-green-100 text-green-800',
  cancelada: 'bg-red-100 text-red-800',
  concluida: 'bg-blue-100 text-blue-800',
  expirada: 'bg-gray-100 text-gray-800',
  em_andamento: 'bg-purple-100 text-purple-800'
};

const ReservaStatus = ({ reserva, isEstacionamento = false, onStatusChange }) => {
  const [showConfirmationPanel, setShowConfirmationPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reservaData, setReservaData] = useState(reserva);

  // Atualiza os dados da reserva quando a prop mudar
  useEffect(() => {
    setReservaData(reserva);
  }, [reserva]);

  const handleConfirmPayment = async () => {
    setShowConfirmationPanel(true);
  };

  const handleStatusUpdate = (updatedReserva) => {
    setReservaData(updatedReserva);
    if (onStatusChange) {
      onStatusChange(updatedReserva);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Reserva #{reservaData.id}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {isEstacionamento ? `Cliente: ${reservaData.usuario_nome}` : `Estacionamento: ${reservaData.estacionamento_nome}`}
          </p>
        </div>
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[reservaData.status] || 'bg-gray-100 text-gray-800'}`}>
          {STATUS_LABELS[reservaData.status] || reservaData.status}
        </span>
      </div>
      
      <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
        <dl className="sm:divide-y sm:divide-gray-200">
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">Período</dt>
            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
              {formatDate(reservaData.data_entrada)} até {formatDate(reservaData.data_saida)}
            </dd>
          </div>
          
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">Vaga</dt>
            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
              {reservaData.vaga_numero || 'N/A'}
            </dd>
          </div>
          
          <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
            <dt className="text-sm font-medium text-gray-500">Valor</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900 sm:mt-0 sm:col-span-2">
              {formatCurrency(reservaData.valor)}
            </dd>
          </div>
          
          {reservaData.status_pagamento && (
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Status do Pagamento</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  reservaData.status_pagamento === 'paid' ? 'bg-green-100 text-green-800' :
                  reservaData.status_pagamento === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {reservaData.status_pagamento === 'paid' ? 'Pago' :
                   reservaData.status_pagamento === 'pending' ? 'Pendente' :
                   'Cancelado/Estornado'}
                </span>
                {reservaData.data_pagamento && (
                  <span className="ml-2 text-gray-500">
                    em {formatDate(reservaData.data_pagamento)}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>
      
      {/* Botão de ação para o estacionamento confirmar pagamento */}
      {isEstacionamento && reservaData.status_pagamento === 'pending' && (
        <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
          <button
            type="button"
            onClick={handleConfirmPayment}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Confirmar Recebimento PIX
          </button>
        </div>
      )}
      
      {/* Painel de confirmação de pagamento */}
      {showConfirmationPanel && isEstacionamento && (
        <div className="border-t border-gray-200 p-4">
          <PixConfirmationPanel 
            reserva={reservaData}
            onConfirm={handleStatusUpdate}
            onCancel={() => setShowConfirmationPanel(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ReservaStatus;
