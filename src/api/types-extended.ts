/**
 * Deal/Budget entity representing project budgets or deals
 */
export interface ProductiveDeal {
  id: string;
  type: 'deals';
  attributes: {
    name: string;
    budget_type?: number; // 1: deal, 2: budget
    value?: number;
    created_at?: string;
    updated_at?: string;
    [key: string]: any;
  };
  relationships?: {
    project?: {
      data?: {
        id: string;
        type: 'projects';
      };
    };
    services?: {
      data?: Array<{
        id: string;
        type: 'services';
      }>;
    };
    [key: string]: any;
  };
}

/**
 * Time entry creation interface for Productive API
 * Used when creating new time entries via POST requests
 */
export interface ProductiveTimeEntryCreate {
  data: {
    type: 'time_entries';
    attributes: {
      date: string; // ISO date format (YYYY-MM-DD)
      time: number; // Time in minutes (required)
      billable_time?: number; // Billable time in minutes, defaults to time value
      note?: string; // Description of work performed
    };
    relationships: {
      person: {
        data: {
          id: string;
          type: 'people';
        };
      };
      service: {
        data: {
          id: string;
          type: 'services';
        };
      };
      task?: {
        data: {
          id: string;
          type: 'tasks';
        };
      };
    };
  };
}

export interface ProductiveError {
  errors: Array<{
    status?: string;
    title?: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
    };
  }>;
}

/**
 * Task reposition interface for Productive API
 * Used when repositioning tasks in a task list
 */
export interface TaskReposition {
  move_before_id?: string; // Move task before specified task ID
  move_after_id?: string;  // Move task after specified task ID
  placement?: number;      // Legacy parameter, not recommended
}

/**
 * Time entry update interface for Productive API
 */
export interface ProductiveTimeEntryUpdate {
  data: {
    type: 'time_entries';
    id: string;
    attributes?: {
      date?: string;
      time?: number;
      billable_time?: number;
      note?: string;
    };
    relationships?: {
      service?: {
        data: {
          id: string;
          type: 'services';
        };
      };
      task?: {
        data: {
          id: string;
          type: 'tasks';
        } | null;
      };
    };
  };
}

/**
 * Invoice entity representing billing invoices in Productive
 */
export interface ProductiveInvoice {
  id: string;
  type: 'invoices';
  attributes: {
    number?: string;
    status?: number; // 1=draft, 2=sent, 3=paid, 4=canceled
    currency?: string;
    total?: number;
    total_tax?: number;
    paid_amount?: number;
    due_date?: string;
    invoice_date?: string;
    note?: string;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    company?: {
      data: {
        id: string;
        type: 'companies';
      };
    };
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Expense entity for tracking project expenses
 */
export interface ProductiveExpense {
  id: string;
  type: 'expenses';
  attributes: {
    date: string;
    amount: number;
    currency?: string;
    note?: string;
    billable?: boolean;
    approved?: boolean;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    person?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    deal?: {
      data: {
        id: string;
        type: 'deals';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Expense creation interface for Productive API
 */
export interface ProductiveExpenseCreate {
  data: {
    type: 'expenses';
    attributes: {
      name: string;
      date: string;
      amount: number;
      currency: string;
      note?: string;
      billable?: boolean;
    };
    relationships: {
      person: {
        data: {
          id: string;
          type: 'people';
        };
      };
      service: {
        data: {
          id: string;
          type: 'services';
        };
      };
    };
  };
}

/**
 * Membership entity representing project/team memberships
 */
export interface ProductiveMembership {
  id: string;
  type: 'memberships';
  attributes: {
    role?: number;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    person?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Todo/checklist item within a task
 */
export interface ProductiveTodo {
  id: string;
  type: 'todos';
  attributes: {
    description: string;
    closed: boolean;
    position?: number;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    task?: {
      data: {
        id: string;
        type: 'tasks';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Todo creation interface
 */
export interface ProductiveTodoCreate {
  data: {
    type: 'todos';
    attributes: {
      description: string;
    };
    relationships: {
      task: {
        data: {
          id: string;
          type: 'tasks';
        };
      };
    };
  };
}

/**
 * Task dependency entity
 */
export interface ProductiveDependency {
  id: string;
  type: 'task_dependencies';
  attributes: {
    type_string?: 'blocking' | 'waiting_on' | 'related';
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    task?: {
      data: {
        id: string;
        type: 'tasks';
      };
    };
    depends_on?: {
      data: {
        id: string;
        type: 'tasks';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Task dependency creation interface
 */
export interface ProductiveDependencyCreate {
  data: {
    type: 'task_dependencies';
    attributes?: {
      type_string?: 'blocking' | 'waiting_on' | 'related';
    };
    relationships: {
      task: {
        data: {
          id: string;
          type: 'tasks';
        };
      };
      depends_on: {
        data: {
          id: string;
          type: 'tasks';
        };
      };
    };
  };
}

/**
 * Page/document entity in Productive knowledge base
 */
export interface ProductivePage {
  id: string;
  type: 'pages';
  attributes: {
    title: string;
    content?: string;
    visibility?: string;
    position?: number;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    parent?: {
      data: {
        id: string;
        type: 'pages';
      } | null;
    };
    [key: string]: unknown;
  };
}

/**
 * Attachment entity for files attached to tasks or comments
 */
export interface ProductiveAttachment {
  id: string;
  type: 'attachments';
  attributes: {
    filename: string;
    url?: string;
    content_type?: string;
    filesize?: number;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    attachable?: {
      data: {
        id: string;
        type: string;
      };
    };
    creator?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Folder entity for organising boards within a project.
 * Productive's `folders` resource groups boards under a named folder.
 */
export interface ProductiveFolder {
  id: string;
  type: 'folders';
  attributes: {
    name: string;
    status?: number; // 1 = active, 2 = archived
    position?: number;
    created_at: string;
    updated_at: string;
    archived_at?: string;
    [key: string]: unknown;
  };
  relationships?: {
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    [key: string]: unknown;
  };
}

/**
 * Folder creation interface for Productive API.
 */
export interface ProductiveFolderCreate {
  data: {
    type: 'folders';
    attributes: {
      name: string;
    };
    relationships: {
      project: {
        data: {
          id: string;
          type: 'projects';
        };
      };
    };
  };
}

/**
 * Booking entity for resource planning/capacity management
 */
export interface ProductiveBooking {
  id: string;
  type: 'bookings';
  attributes: {
    started_on: string;
    ended_on: string;
    time?: number; // minutes per day
    booked_time?: number;
    note?: string;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
  };
  relationships?: {
    person?: {
      data: {
        id: string;
        type: 'people';
      };
    };
    project?: {
      data: {
        id: string;
        type: 'projects';
      };
    };
    deal?: {
      data: {
        id: string;
        type: 'deals';
      };
    };
    [key: string]: unknown;
  };
}
