// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract gachonCoin {
    mapping (string => uint256) balance;

    function regUser (string memory _name, uint256 _bal) public {
        balance[_name] = _bal;
    }

    function checkBal(string memory _name) public view returns (uint256) {
        return balance[_name];
    }

    function transBal(string memory _from, string memory _to, uint256 _amount) public {
        if(balance[_from] > _amount) {
            balance[_from] -= _amount;
            balance[_to] += _amount;
        }
        else {
            revert("not enough balance");
        }
    }
}
 