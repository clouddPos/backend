// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Settlement
 * @notice Records card transaction settlements on-chain for transparency and audit.
 * @dev Deployed by the CloudPOS platform. Only authorized operators can record settlements.
 */
contract Settlement {
    struct SettlementRecord {
        string   txId;
        uint256  amount;
        address  merchant;
        string   currency;
        uint256  timestamp;
        bool     finalized;
    }

    address public owner;
    mapping(address => bool) public operators;
    mapping(uint256 => SettlementRecord) public settlements;
    uint256 public settlementCount;

    event SettlementRecorded(
        uint256 indexed settlementId,
        string txId,
        uint256 amount,
        address indexed merchant
    );
    event SettlementFinalized(uint256 indexed settlementId);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        operators[msg.sender] = true;
    }

    function addOperator(address _operator) external onlyOwner {
        operators[_operator] = true;
        emit OperatorAdded(_operator);
    }

    function removeOperator(address _operator) external onlyOwner {
        operators[_operator] = false;
        emit OperatorRemoved(_operator);
    }

    /**
     * @notice Record a new settlement on-chain.
     * @param _txId     Off-chain transaction ID
     * @param _amount   Settlement amount in minor units
     * @param _merchant Merchant wallet address
     * @param _currency Currency code (e.g. "USD")
     * @return settlementId The ID of the new settlement record
     */
    function recordSettlement(
        string calldata _txId,
        uint256 _amount,
        address _merchant,
        string calldata _currency
    ) external onlyOperator returns (uint256 settlementId) {
        settlementId = settlementCount++;

        settlements[settlementId] = SettlementRecord({
            txId:       _txId,
            amount:     _amount,
            merchant:   _merchant,
            currency:   _currency,
            timestamp:  block.timestamp,
            finalized:  false
        });

        emit SettlementRecorded(settlementId, _txId, _amount, _merchant);
    }

    /**
     * @notice Finalize a settlement (marks it as complete).
     */
    function finalizeSettlement(uint256 _settlementId) external onlyOperator {
        require(_settlementId < settlementCount, "Invalid settlement ID");
        require(!settlements[_settlementId].finalized, "Already finalized");

        settlements[_settlementId].finalized = true;
        emit SettlementFinalized(_settlementId);
    }

    /**
     * @notice Get settlement details.
     */
    function getSettlement(uint256 _settlementId)
        external
        view
        returns (SettlementRecord memory)
    {
        require(_settlementId < settlementCount, "Invalid settlement ID");
        return settlements[_settlementId];
    }
}
