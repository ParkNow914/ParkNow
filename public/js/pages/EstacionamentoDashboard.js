import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ReservaStatus from '../components/ReservaStatus';

const EstacionamentoDashboard = ({ estacionamentoId }) => {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('pendentes');

  useEffect(() => {
    const fetchReservas = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setError('Você precisa estar logado para acessar o painel');
          setLoading(false);
          return;
        }

        const response = await axios.get(`/api/estacionamentos/${estacionamentoId}/reservas`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        setReservas(response.data.data || []);
      } catch (err) {
        console.error('Erro ao buscar reservas do estacionamento:', err);
        setError('Erro ao carregar as reservas. Tente novamente mais tarde.');
      } finally {
        setLoading(false);
      }
    };

    if (estacionamentoId) {
      fetchReservas();
    }
  }, [estacionamentoId]);

  const handleReservaUpdate = (updatedReserva) => {
    setReservas(prevReservas => 
      prevReservas.map(r => 
        r.id === updatedReserva.id ? { ...r, ...updatedReserva } : r
      )
    );
  };

  const filteredReservas = reservas.filter(reserva => {
    if (activeTab === 'pendentes') {
      return reserva.status_pagamento === 'pending';
    } else if (activeTab === 'confirmadas') {
      return reserva.status_pagamento === 'paid';
    } else if (activeTab === 'todas') {
      return true;
    }
    return false;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pendentes')}
            className={`${activeTab === 'pendentes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Pagamentos Pendentes
            {reservas.filter(r => r.status_pagamento === 'pending').length > 0 && (
              <span className="ml-2 bg-red-100 text-red-600 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {reservas.filter(r => r.status_pagamento === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('confirmadas')}
            className={`${activeTab === 'confirmadas' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Pagos
          </button>
          <button
            onClick={() => setActiveTab('todas')}
            className={`${activeTab === 'todas' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Todas as Reservas
          </button>
        </nav>
      </div>

      {filteredReservas.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhuma reserva encontrada</h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'pendentes' 
              ? 'Não há pagamentos pendentes no momento.' 
              : activeTab === 'confirmadas' 
                ? 'Nenhum pagamento confirmado ainda.'
                : 'Nenhuma reserva encontrada para este estacionamento.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredReservas.map((reserva) => (
            <ReservaStatus 
              key={reserva.id}
              reserva={reserva}
              isEstacionamento={true}
              onStatusChange={handleReservaUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default EstacionamentoDashboard;
