export const ALL_CUSTOM_RPC_ERRORS = {
  // =========================================================================
  //  0. CÁC MÃ LỖI TIÊU CHUẨN HTTP (GENERIC ERRORS)
  // =========================================================================
  BAD_REQUEST: {
    statusCode: 400,
    message: 'Dữ liệu đầu vào không hợp lệ (Bad Request)',
  },
  UNAUTHORIZED: {
    statusCode: 401,
    message: 'Chưa xác thực hoặc phiên đăng nhập không hợp lệ (Unauthorized)',
  },
  FORBIDDEN: {
    statusCode: 403,
    message: 'Bạn không có quyền thực hiện hành động này (Forbidden)',
  },
  NOT_FOUND: {
    statusCode: 404,
    message: 'Không tìm thấy tài nguyên yêu cầu (Not Found)',
  },
  CONFLICT: {
    statusCode: 409,
    message: 'Dữ liệu bị trùng lặp hoặc xung đột (Conflict)',
  },
  INTERNAL_SERVER_ERROR: {
    statusCode: 500,
    message: 'Lỗi hệ thống máy chủ (Internal Server Error)',
  },
  TIMEOUT: {
    statusCode: 504,
    message: 'Yêu cầu vượt quá thời gian xử lý (Gateway Timeout)',
  },

  // =========================================================================
  //  1. AUTH SERVICE
  // =========================================================================
  AUTH_ACCOUNT_LOCKED: {
    statusCode: 401,
    message: 'Tài khoản không tồn tại hoặc đã bị khóa',
  },
  AUTH_TOKEN_INVALID: {
    statusCode: 401,
    message: 'Token không hợp lệ hoặc đã hết hạn',
  },
  AUTH_WRONG_CREDENTIALS: {
    statusCode: 401,
    message: 'Tài khoản hoặc mật khẩu không chính xác',
  },
  AUTH_EMAIL_EXISTS: {
    statusCode: 409,
    message: 'Email này đã được sử dụng',
  },

  // =========================================================================
  //  2. USERS SERVICE
  // =========================================================================
  USER_NOT_FOUND: {
    statusCode: 404,
    message: 'Người dùng không tồn tại',
  },
  USER_ACCOUNT_DELETED: {
    statusCode: 404,
    message: 'Tài khoản không tồn tại hoặc đã bị xóa. Vui lòng liên hệ hỗ trợ!',
  },
  USER_WRONG_OLD_PASSWORD: {
    statusCode: 400,
    message: 'Mật khẩu cũ không chính xác',
  },

  // =========================================================================
  //  3. APPROVAL SERVICE
  // =========================================================================
  APPROVAL_FORBIDDEN: {
    statusCode: 403,
    message: 'Bạn không có quyền phê duyệt đơn này',
  },
  APPROVAL_ALREADY_PROCESSED: {
    statusCode: 400,
    message: 'Đơn này đã được xử lý rồi, không thể duyệt lại',
  },
  APPROVAL_NOT_FOUND: {
    statusCode: 404,
    message: 'Không tìm thấy đơn duyệt theo ID được yêu cầu',
  },

  // =========================================================================
  //  4. VALIDATION PIPES
  // =========================================================================
  VALIDATION_ERROR: {
    statusCode: 400,
    message: 'Dữ liệu đầu vào không hợp lệ (Validation Error)',
  },

  // =========================================================================
  //  5. LEAVE REQUEST SERVICE
  // =========================================================================
  LEAVE_REQUEST_NOT_FOUND: {
    statusCode: 404,
    message: 'Không tìm thấy đơn xin nghỉ phép theo ID được yêu cầu',
  },
  LEAVE_REQUEST_CONFLICT: {
    statusCode: 409,
    message:
      'Khoảng thời gian này bạn đã có đơn xin nghỉ đang chờ duyệt hoặc đã được duyệt',
  },
  LEAVE_REQUEST_ALREADY_PROCESSED: {
    statusCode: 422,
    message:
      'Bạn không được hủy đơn của người khác hoặc đơn này đã được duyệt hoặc đã bị hủy, không thể tiếp tục hủy',
  },
  LEAVE_REQUEST_CANNOT_CANCEL: {
    statusCode: 400,
    message:
      'Không thể hủy đơn này vì đơn đã được xử lý hoặc không còn ở trạng thái chờ duyệt',
  },
  LEAVE_REQUEST_INVALID_DATE_FILTER: {
    statusCode: 400,
    message:
      'Bộ lọc thời gian không hợp lệ: startDate không được lớn hơn endDate',
  },
} as const;
